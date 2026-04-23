package gateway

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imageproxy"
)

const (
	defaultImageProxyCacheTTL        = 30 * time.Minute
	defaultImageProxyCacheMaxEntries = 64
)

var defaultImageBytesCache = newImageProxyCache(defaultImageProxyCacheTTL, defaultImageProxyCacheMaxEntries)

var errProxyImageNotFound = errors.New("proxy image not found")

type cachedProxyImage struct {
	body        []byte
	contentType string
	expiresAt   time.Time
	storedAt    time.Time
}

type imageProxyCache struct {
	ttl        time.Duration
	maxEntries int
	now        func() time.Time

	mu    sync.RWMutex
	items map[string]cachedProxyImage
}

func newImageProxyCache(ttl time.Duration, maxEntries int) *imageProxyCache {
	if ttl <= 0 {
		ttl = defaultImageProxyCacheTTL
	}
	if maxEntries <= 0 {
		maxEntries = defaultImageProxyCacheMaxEntries
	}
	return &imageProxyCache{
		ttl:        ttl,
		maxEntries: maxEntries,
		now:        time.Now,
		items:      make(map[string]cachedProxyImage, maxEntries),
	}
}

func (c *imageProxyCache) get(key string) ([]byte, string, bool) {
	now := c.now()

	c.mu.RLock()
	item, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, "", false
	}
	if !item.expiresAt.After(now) {
		c.mu.Lock()
		if current, ok := c.items[key]; ok && !current.expiresAt.After(now) {
			delete(c.items, key)
		}
		c.mu.Unlock()
		return nil, "", false
	}
	return cloneBytes(item.body), item.contentType, true
}

func (c *imageProxyCache) set(key string, body []byte, contentType string) {
	now := c.now()

	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = cachedProxyImage{
		body:        cloneBytes(body),
		contentType: contentType,
		expiresAt:   now.Add(c.ttl),
		storedAt:    now,
	}
	c.evictLocked(now)
}

func (c *imageProxyCache) evictLocked(now time.Time) {
	for key, item := range c.items {
		if !item.expiresAt.After(now) {
			delete(c.items, key)
		}
	}
	for len(c.items) > c.maxEntries {
		oldestKey := ""
		var oldestAt time.Time
		for key, item := range c.items {
			if oldestKey == "" || item.storedAt.Before(oldestAt) {
				oldestKey = key
				oldestAt = item.storedAt
			}
		}
		if oldestKey == "" {
			return
		}
		delete(c.items, oldestKey)
	}
}

func (h *ImagesHandler) proxyImageCache() *imageProxyCache {
	if h != nil && h.imageProxyCache != nil {
		return h.imageProxyCache
	}
	return defaultImageBytesCache
}

func (h *ImagesHandler) loadProxyImage(ctx context.Context, task *image.Task, idx int, resource string) ([]byte, string, error) {
	cacheKey := fmt.Sprintf("%s:%d:%s", task.TaskID, idx, imageproxy.NormalizeResource(resource))
	cache := h.proxyImageCache()
	if body, contentType, ok := cache.get(cacheKey); ok {
		return body, contentType, nil
	}

	body, contentType, ok, err := h.readLocalProxyImage(ctx, task, idx, resource)
	if err != nil {
		return nil, "", err
	}
	if !ok && image.NormalizeStorageMode(task.StorageMode) == image.StorageModeCloud {
		body, contentType, ok, err = h.readCloudProxyImage(ctx, task, idx, resource)
		if err != nil {
			return nil, "", err
		}
	}
	if !ok {
		return nil, "", errProxyImageNotFound
	}
	cache.set(cacheKey, body, contentType)
	return cloneBytes(body), contentType, nil
}

func (h *ImagesHandler) readLocalProxyImage(ctx context.Context, task *image.Task, idx int, resource string) ([]byte, string, bool, error) {
	_ = ctx
	if h == nil || h.LocalImageStore == nil {
		return nil, "", false, nil
	}
	if imageproxy.NormalizeResource(resource) == imageproxy.ResourceThumb {
		return h.LocalImageStore.ReadThumb(task.TaskID, idx)
	}
	return h.LocalImageStore.ReadOriginal(task.TaskID, idx)
}

func (h *ImagesHandler) readCloudProxyImage(ctx context.Context, task *image.Task, idx int, resource string) ([]byte, string, bool, error) {
	if imageproxy.NormalizeResource(resource) != imageproxy.ResourceOriginal {
		return nil, "", false, nil
	}
	urls := task.DecodeResultURLs()
	if idx < 0 || idx >= len(urls) {
		return nil, "", false, nil
	}
	remoteURL := strings.TrimSpace(urls[idx])
	if remoteURL == "" {
		return nil, "", false, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, remoteURL, nil)
	if err != nil {
		return nil, "", false, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", false, err
	}
	defer res.Body.Close()
	if res.StatusCode >= http.StatusBadRequest {
		return nil, "", false, fmt.Errorf("fetch cloud image failed: status=%d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 16*1024*1024+1))
	if err != nil {
		return nil, "", false, err
	}
	if len(body) > 16*1024*1024 {
		return nil, "", false, errors.New("cloud image exceeds max bytes")
	}
	contentType := strings.TrimSpace(res.Header.Get("Content-Type"))
	if contentType == "" && len(body) > 0 {
		contentType = http.DetectContentType(body)
	}
	return body, contentType, true, nil
}

func cloneBytes(src []byte) []byte {
	if len(src) == 0 {
		return nil
	}
	dst := make([]byte, len(src))
	copy(dst, src)
	return dst
}
