package imagestore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

type SanyueImgHubUploaderOptions struct {
	UploadURL      string
	AuthCode       string
	ServerCompress bool
	ReturnFormat   string
	UploadChannel  string
	HTTPClient     *http.Client
}

type SanyueImgHubUploader struct {
	uploadURL      string
	authCode       string
	serverCompress bool
	returnFormat   string
	uploadChannel  string
	httpClient     *http.Client
}

func NewSanyueImgHubUploader(opts SanyueImgHubUploaderOptions) *SanyueImgHubUploader {
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &SanyueImgHubUploader{
		uploadURL:      strings.TrimSpace(opts.UploadURL),
		authCode:       strings.TrimSpace(opts.AuthCode),
		serverCompress: opts.ServerCompress,
		returnFormat:   strings.TrimSpace(opts.ReturnFormat),
		uploadChannel:  normalizeSanyueImgHubUploadChannel(opts.UploadChannel),
		httpClient:     client,
	}
}

func (u *SanyueImgHubUploader) Upload(ctx context.Context, src SourceImage) (string, error) {
	return u.UploadToChannel(ctx, src, "")
}

func (u *SanyueImgHubUploader) UploadToChannel(ctx context.Context, src SourceImage, channel string) (string, error) {
	if u == nil {
		return "", fmt.Errorf("sanyue imghub uploader is nil")
	}
	if strings.TrimSpace(u.uploadURL) == "" {
		return "", fmt.Errorf("sanyue imghub upload_url required")
	}

	uploadURL, err := url.Parse(u.uploadURL)
	if err != nil {
		return "", fmt.Errorf("parse upload url: %w", err)
	}
	query := uploadURL.Query()
	query.Set("authCode", u.authCode)
	query.Set("serverCompress", strconv.FormatBool(u.serverCompress))
	query.Set("returnFormat", u.returnFormat)
	query.Set("uploadChannel", u.effectiveUploadChannel(channel))
	uploadURL.RawQuery = query.Encode()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileName := u.fileName(src)
	partContentType := strings.TrimSpace(src.ContentType)
	if _, normalized := normalizeImageType(src.ContentType, src.Data); partContentType == "" {
		partContentType = normalized
	}
	if partContentType == "" {
		partContentType = "application/octet-stream"
	}
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, fileName))
	header.Set("Content-Type", partContentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return "", fmt.Errorf("create multipart file: %w", err)
	}
	if _, err := part.Write(src.Data); err != nil {
		return "", fmt.Errorf("write multipart file: %w", err)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL.String(), &body)
	if err != nil {
		return "", fmt.Errorf("build upload request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read upload response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var payload []struct {
		Src string `json:"src"`
	}
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return "", fmt.Errorf("decode upload response: %w", err)
	}
	if len(payload) == 0 {
		return "", fmt.Errorf("upload response empty")
	}
	if strings.TrimSpace(payload[0].Src) == "" {
		return "", fmt.Errorf("upload response missing src")
	}
	return strings.TrimSpace(payload[0].Src), nil
}

func (u *SanyueImgHubUploader) effectiveUploadChannel(channel string) string {
	if strings.TrimSpace(channel) != "" {
		return normalizeSanyueImgHubUploadChannel(channel)
	}
	return normalizeSanyueImgHubUploadChannel(u.uploadChannel)
}

func normalizeSanyueImgHubUploadChannel(channel string) string {
	switch strings.ToLower(strings.TrimSpace(channel)) {
	case "huggingface":
		return "huggingface"
	default:
		return "telegram"
	}
}

func (u *SanyueImgHubUploader) fileName(src SourceImage) string {
	ext, _ := normalizeImageType(src.ContentType, src.Data)
	if ext == "" {
		ext = "bin"
	}
	return fmt.Sprintf("image_%d.%s", src.Index, ext)
}
