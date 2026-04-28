package imagestore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	ResourceOriginal       = "original"
	ResourceThumb          = "thumb"
	ResourceReference      = "reference"
	ResourceReferenceThumb = "reference_thumb"
)

type LocalOptions struct {
	RootDir      string
	ThumbMaxEdge int
	ThumbQuality int
}

type SourceImage struct {
	Index       int
	FileName    string
	Data        []byte
	ContentType string
}

type SavedImage struct {
	Index        int
	OriginalName string
	ThumbName    string
}

type FileInfo struct {
	Name       string    `json:"name"`
	TaskID     string    `json:"task_id"`
	Index      int       `json:"idx"`
	SizeBytes  int64     `json:"size_bytes"`
	ModifiedAt time.Time `json:"modified_at"`
	Path       string    `json:"path,omitempty"`
}

type DiskInfo struct {
	TotalBytes        uint64  `json:"total_bytes"`
	UsedBytes         uint64  `json:"used_bytes"`
	FreeBytes         uint64  `json:"free_bytes"`
	UsedPercent       float64 `json:"used_percent"`
	OriginalBytes     int64   `json:"original_bytes"`
	ThumbBytes        int64   `json:"thumb_bytes"`
	OriginalFileCount int     `json:"original_file_count"`
	ThumbFileCount    int     `json:"thumb_file_count"`
}

type Local struct {
	rootDir      string
	originalDir  string
	thumbDir     string
	thumbMaxEdge int
	thumbQuality int
}

func NewLocal(opts LocalOptions) *Local {
	root := strings.TrimSpace(opts.RootDir)
	if root == "" {
		root = "storage/images"
	}
	thumbMaxEdge := opts.ThumbMaxEdge
	if thumbMaxEdge == 0 {
		thumbMaxEdge = DefaultThumbMaxEdge
	}
	thumbQuality := opts.ThumbQuality
	if thumbQuality <= 0 {
		thumbQuality = DefaultThumbQuality
	}
	return &Local{
		rootDir:      root,
		originalDir:  filepath.Join(root, "original"),
		thumbDir:     filepath.Join(root, "thumb"),
		thumbMaxEdge: thumbMaxEdge,
		thumbQuality: thumbQuality,
	}
}

func (l *Local) SaveTaskImages(ctx context.Context, taskID string, images []SourceImage) ([]SavedImage, error) {
	return l.saveTaskImages(ctx, taskID, images, false)
}

func (l *Local) SaveTaskReferences(ctx context.Context, taskID string, images []SourceImage) ([]SavedImage, error) {
	return l.saveTaskImages(ctx, taskID, images, true)
}

func (l *Local) saveTaskImages(ctx context.Context, taskID string, images []SourceImage, reference bool) ([]SavedImage, error) {
	if err := l.ensureDirs(); err != nil {
		return nil, err
	}
	resource := ResourceOriginal
	thumbResource := ResourceThumb
	if reference {
		resource = ResourceReference
		thumbResource = ResourceReferenceThumb
	}
	saved := make([]SavedImage, 0, len(images))
	cleanup := make([]string, 0, len(images)*2)
	for _, src := range images {
		if err := ctx.Err(); err != nil {
			l.removeFiles(cleanup)
			return nil, err
		}
		ext, _ := normalizeImageType(src.ContentType, src.Data)
		if reference {
			ext, _ = normalizeImageTypeWithFileName(src.ContentType, src.FileName, src.Data)
		}
		if ext == "" {
			l.removeFiles(cleanup)
			return nil, errors.New("unsupported image type")
		}
		originalName := l.originalFileName(taskID, src.Index, resource, ext)
		thumbName := l.thumbFileName(taskID, src.Index, thumbResource)

		if err := writeAtomic(filepath.Join(l.originalDir, originalName), src.Data); err != nil {
			l.removeFiles(cleanup)
			return nil, err
		}
		cleanup = append(cleanup, filepath.Join(l.originalDir, originalName))

		thumbData, err := l.buildThumb(src.Data)
		if err != nil {
			if reference {
				thumbData, err = l.buildPlaceholderThumbJPEG()
			}
			if err != nil {
				l.removeFiles(cleanup)
				return nil, err
			}
		}
		if err := writeAtomic(filepath.Join(l.thumbDir, thumbName), thumbData); err != nil {
			l.removeFiles(cleanup)
			return nil, err
		}
		cleanup = append(cleanup, filepath.Join(l.thumbDir, thumbName))

		saved = append(saved, SavedImage{
			Index:        src.Index,
			OriginalName: originalName,
			ThumbName:    thumbName,
		})
	}
	return saved, nil
}

func (l *Local) FindOriginal(taskID string, idx int) (FileInfo, bool, error) {
	if err := l.ensureDirs(); err != nil {
		return FileInfo{}, false, err
	}
	pattern := filepath.Join(l.originalDir, fmt.Sprintf("%s_%d.*", taskID, idx))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return FileInfo{}, false, err
	}
	if len(matches) == 0 {
		return FileInfo{}, false, nil
	}
	sort.Strings(matches)
	return l.statFile(matches[0], ResourceOriginal)
}

func (l *Local) FindThumb(taskID string, idx int) (FileInfo, bool, error) {
	if err := l.ensureDirs(); err != nil {
		return FileInfo{}, false, err
	}
	path := filepath.Join(l.thumbDir, l.thumbFileName(taskID, idx, ResourceThumb))
	return l.statFile(path, ResourceThumb)
}

func (l *Local) FindReference(taskID string, idx int) (FileInfo, bool, error) {
	if err := l.ensureDirs(); err != nil {
		return FileInfo{}, false, err
	}
	pattern := filepath.Join(l.originalDir, l.originalGlob(taskID, idx, ResourceReference))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return FileInfo{}, false, err
	}
	if len(matches) == 0 {
		return FileInfo{}, false, nil
	}
	sort.Strings(matches)
	return l.statFile(matches[0], ResourceReference)
}

func (l *Local) FindReferenceThumb(taskID string, idx int) (FileInfo, bool, error) {
	if err := l.ensureDirs(); err != nil {
		return FileInfo{}, false, err
	}
	path := filepath.Join(l.thumbDir, l.thumbFileName(taskID, idx, ResourceReferenceThumb))
	return l.statFile(path, ResourceReferenceThumb)
}

func (l *Local) HasOriginal(taskID string, idx int) (bool, error) {
	_, ok, err := l.FindOriginal(taskID, idx)
	return ok, err
}

func (l *Local) HasThumb(taskID string, idx int) (bool, error) {
	_, ok, err := l.FindThumb(taskID, idx)
	return ok, err
}

func (l *Local) HasReference(taskID string, idx int) (bool, error) {
	_, ok, err := l.FindReference(taskID, idx)
	return ok, err
}

func (l *Local) HasReferenceThumb(taskID string, idx int) (bool, error) {
	_, ok, err := l.FindReferenceThumb(taskID, idx)
	return ok, err
}

func (l *Local) ReadOriginal(taskID string, idx int) ([]byte, string, bool, error) {
	info, ok, err := l.FindOriginal(taskID, idx)
	if err != nil || !ok {
		return nil, "", ok, err
	}
	data, err := os.ReadFile(filepath.Join(l.originalDir, info.Name))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}
	_, ct := normalizeImageType("", data)
	return data, ct, true, nil
}

func (l *Local) ReadThumb(taskID string, idx int) ([]byte, string, bool, error) {
	info, ok, err := l.FindThumb(taskID, idx)
	if err != nil || !ok {
		return nil, "", ok, err
	}
	data, err := os.ReadFile(filepath.Join(l.thumbDir, info.Name))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}
	return data, "image/jpeg", true, nil
}

func (l *Local) ReadReference(taskID string, idx int) ([]byte, string, bool, error) {
	info, ok, err := l.FindReference(taskID, idx)
	if err != nil || !ok {
		return nil, "", ok, err
	}
	data, err := os.ReadFile(filepath.Join(l.originalDir, info.Name))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}
	_, ct := normalizeImageTypeWithFileName("", info.Name, data)
	return data, ct, true, nil
}

func (l *Local) ReadReferenceThumb(taskID string, idx int) ([]byte, string, bool, error) {
	info, ok, err := l.FindReferenceThumb(taskID, idx)
	if err != nil || !ok {
		return nil, "", ok, err
	}
	data, err := os.ReadFile(filepath.Join(l.thumbDir, info.Name))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}
	return data, "image/jpeg", true, nil
}

func (l *Local) ListFiles(resource string, limit, offset int) ([]FileInfo, int, error) {
	if limit <= 0 {
		limit = 50
	}
	dir := l.dirFor(resource)
	if err := l.ensureDirs(); err != nil {
		return nil, 0, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, 0, err
	}
	items := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, ok, err := l.statFile(filepath.Join(dir, entry.Name()), normalizeResource(resource))
		if err != nil {
			return nil, 0, err
		}
		if ok {
			items = append(items, info)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].ModifiedAt.Equal(items[j].ModifiedAt) {
			return items[i].Name < items[j].Name
		}
		return items[i].ModifiedAt.After(items[j].ModifiedAt)
	})
	total := len(items)
	if offset < 0 {
		offset = 0
	}
	if offset >= total {
		return []FileInfo{}, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return items[offset:end], total, nil
}

func (l *Local) DeleteFiles(resource string, names []string) (int, error) {
	if err := l.ensureDirs(); err != nil {
		return 0, err
	}
	dir := l.dirFor(resource)
	deleted := 0
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" || filepath.Base(name) != name {
			continue
		}
		path := filepath.Join(dir, name)
		err := os.Remove(path)
		if err == nil {
			deleted++
			continue
		}
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		return deleted, err
	}
	return deleted, nil
}

func (l *Local) DiskStats() (DiskInfo, error) {
	if err := l.ensureDirs(); err != nil {
		return DiskInfo{}, err
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(l.rootDir, &stat); err != nil {
		return DiskInfo{}, err
	}
	originalBytes, originalCount, err := dirUsage(l.originalDir)
	if err != nil {
		return DiskInfo{}, err
	}
	thumbBytes, thumbCount, err := dirUsage(l.thumbDir)
	if err != nil {
		return DiskInfo{}, err
	}
	totalBytes := stat.Blocks * uint64(stat.Bsize)
	freeBytes := stat.Bavail * uint64(stat.Bsize)
	usedBytes := totalBytes - freeBytes
	usedPercent := 0.0
	if totalBytes > 0 {
		usedPercent = float64(usedBytes) * 100 / float64(totalBytes)
	}
	return DiskInfo{
		TotalBytes:        totalBytes,
		UsedBytes:         usedBytes,
		FreeBytes:         freeBytes,
		UsedPercent:       usedPercent,
		OriginalBytes:     originalBytes,
		ThumbBytes:        thumbBytes,
		OriginalFileCount: originalCount,
		ThumbFileCount:    thumbCount,
	}, nil
}

func (l *Local) ensureDirs() error {
	if err := os.MkdirAll(l.originalDir, 0o755); err != nil {
		return err
	}
	return os.MkdirAll(l.thumbDir, 0o755)
}

func (l *Local) buildThumb(data []byte) ([]byte, error) {
	thumbData, _, err := BuildThumbnail(data, ThumbnailOptions{
		MaxEdge: l.thumbMaxEdge,
		Quality: l.thumbQuality,
	})
	return thumbData, err
}

func (l *Local) buildPlaceholderThumbJPEG() ([]byte, error) {
	quality := l.thumbQuality
	if quality <= 0 {
		quality = DefaultThumbQuality
	}
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 240, G: 240, B: 240, A: 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func fitWithin(width, height, maxEdge int) (int, int) {
	if width <= 0 || height <= 0 {
		return 1, 1
	}
	if maxEdge <= 0 {
		return width, height
	}
	longEdge := width
	if height > longEdge {
		longEdge = height
	}
	if longEdge <= maxEdge {
		return width, height
	}
	if width >= height {
		return maxEdge, max(1, height*maxEdge/width)
	}
	return max(1, width*maxEdge/height), maxEdge
}

func normalizeImageType(contentType string, data []byte) (string, string) {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if ct == "" && len(data) > 0 {
		ct = strings.ToLower(http.DetectContentType(data))
	}
	switch {
	case strings.Contains(ct, "png"):
		return "png", "image/png"
	case strings.Contains(ct, "jpeg"), strings.Contains(ct, "jpg"):
		return "jpg", "image/jpeg"
	case strings.Contains(ct, "webp"):
		return "webp", "image/webp"
	default:
		return "", ct
	}
}

func normalizeImageTypeWithFileName(contentType, fileName string, data []byte) (string, string) {
	if ext, ct := normalizeImageType(contentType, nil); ext != "" {
		return ext, ct
	}
	if ext, ct := normalizeImageType("", data); ext != "" {
		return ext, ct
	}
	return imageTypeFromFileName(fileName)
}

func imageTypeFromFileName(fileName string) (string, string) {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))) {
	case ".png":
		return "png", "image/png"
	case ".jpg", ".jpeg":
		return "jpg", "image/jpeg"
	case ".webp":
		return "webp", "image/webp"
	default:
		return "", ""
	}
}

func (l *Local) removeFiles(paths []string) {
	for i := len(paths) - 1; i >= 0; i-- {
		_ = os.Remove(paths[i])
	}
}

func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func (l *Local) dirFor(resource string) string {
	switch normalizeResource(resource) {
	case ResourceThumb, ResourceReferenceThumb:
		return l.thumbDir
	}
	return l.originalDir
}

func normalizeResource(resource string) string {
	switch resource {
	case ResourceThumb:
		return ResourceThumb
	case ResourceReference:
		return ResourceReference
	case ResourceReferenceThumb:
		return ResourceReferenceThumb
	}
	return ResourceOriginal
}

func (l *Local) statFile(path string, resource string) (FileInfo, bool, error) {
	st, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return FileInfo{}, false, nil
		}
		return FileInfo{}, false, err
	}
	item, ok := parseFileInfo(st.Name(), resource)
	if !ok {
		return FileInfo{}, false, nil
	}
	item.SizeBytes = st.Size()
	item.ModifiedAt = st.ModTime()
	item.Path = path
	return item, true, nil
}

func parseFileInfo(name string, resource string) (FileInfo, bool) {
	raw := name
	normalized := normalizeResource(resource)
	isThumb := normalized == ResourceThumb || normalized == ResourceReferenceThumb
	isReference := normalized == ResourceReference || normalized == ResourceReferenceThumb
	if isThumb {
		if !strings.HasPrefix(raw, "tmp_") || !strings.HasSuffix(strings.ToLower(raw), ".jpg") {
			return FileInfo{}, false
		}
		raw = strings.TrimPrefix(raw, "tmp_")
		raw = strings.TrimSuffix(raw, ".jpg")
	} else {
		ext := strings.ToLower(filepath.Ext(raw))
		if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
			return FileInfo{}, false
		}
		raw = strings.TrimSuffix(raw, filepath.Ext(raw))
	}
	if isReference {
		if !strings.HasPrefix(raw, "ref_") {
			return FileInfo{}, false
		}
		raw = strings.TrimPrefix(raw, "ref_")
	} else if strings.HasPrefix(raw, "ref_") {
		return FileInfo{}, false
	}
	pos := strings.LastIndex(raw, "_")
	if pos <= 0 || pos >= len(raw)-1 {
		return FileInfo{}, false
	}
	idx, err := strconv.Atoi(raw[pos+1:])
	if err != nil || idx < 0 {
		return FileInfo{}, false
	}
	return FileInfo{Name: name, TaskID: raw[:pos], Index: idx}, true
}

func (l *Local) originalGlob(taskID string, idx int, resource string) string {
	return fmt.Sprintf("%s.*", l.fileStem(taskID, idx, resource))
}

func (l *Local) originalFileName(taskID string, idx int, resource string, ext string) string {
	return fmt.Sprintf("%s.%s", l.fileStem(taskID, idx, resource), ext)
}

func (l *Local) thumbFileName(taskID string, idx int, resource string) string {
	return fmt.Sprintf("tmp_%s.jpg", l.fileStem(taskID, idx, resource))
}

func (l *Local) fileStem(taskID string, idx int, resource string) string {
	prefix := ""
	switch normalizeResource(resource) {
	case ResourceReference, ResourceReferenceThumb:
		prefix = "ref_"
	}
	return fmt.Sprintf("%s%s_%d", prefix, taskID, idx)
}

func dirUsage(dir string) (int64, int, error) {
	var total int64
	count := 0
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		count++
		return nil
	})
	return total, count, err
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
