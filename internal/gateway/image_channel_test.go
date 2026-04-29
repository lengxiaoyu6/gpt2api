package gateway

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"github.com/432539/gpt2api/internal/apikey"
	"github.com/432539/gpt2api/internal/channel"
	"github.com/432539/gpt2api/internal/config"
	"github.com/432539/gpt2api/internal/image"
	"github.com/432539/gpt2api/internal/imagestore"
	modelpkg "github.com/432539/gpt2api/internal/model"
	"github.com/432539/gpt2api/internal/upstream/adapter"
	"github.com/432539/gpt2api/internal/usage"
	"github.com/432539/gpt2api/pkg/crypto"

	sqlite3 "github.com/mattn/go-sqlite3"
	stdimage "image"
)

type imageAdapterStub struct {
	mu         sync.Mutex
	imageCalls int
	imageFn    func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error)
}

func (s *imageAdapterStub) Type() string { return "stub" }

func (s *imageAdapterStub) Chat(ctx context.Context, upstreamModel string, req *adapter.ChatRequest) (adapter.ChatStream, error) {
	return nil, errors.New("not implemented")
}

func (s *imageAdapterStub) ImageGenerate(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
	s.mu.Lock()
	s.imageCalls++
	s.mu.Unlock()
	return s.imageFn(ctx, upstreamModel, req)
}

func (s *imageAdapterStub) Ping(ctx context.Context) error { return nil }

func (s *imageAdapterStub) Calls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.imageCalls
}

func (s *imageAdapterStub) SupportsImageReferences() bool {
	return false
}

type referenceCapableImageAdapterStub struct {
	imageAdapterStub
}

func (s *referenceCapableImageAdapterStub) SupportsImageReferences() bool {
	return true
}

type referenceUploaderStub struct {
	mu       sync.Mutex
	calls    int
	sources  []imagestore.SourceImage
	channels []string
	compress []bool
	urls     []string
	err      error
}

func (s *referenceUploaderStub) UploadToChannel(ctx context.Context, src imagestore.SourceImage, channel string) (string, error) {
	return s.UploadToChannelWithOptions(ctx, src, channel, false)
}

func (s *referenceUploaderStub) UploadToChannelWithOptions(ctx context.Context, src imagestore.SourceImage, channel string, serverCompress bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	s.sources = append(s.sources, src)
	s.channels = append(s.channels, channel)
	s.compress = append(s.compress, serverCompress)
	if s.err != nil {
		return "", s.err
	}
	if len(s.urls) == 0 {
		return "", errors.New("missing uploaded url")
	}
	u := s.urls[0]
	s.urls = s.urls[1:]
	return u, nil
}

func TestImageGenerateWithRetryRetriesSameRouteOnce(t *testing.T) {
	attempts := 0
	rt := &channel.Route{
		Channel: &channel.Channel{ID: 1, Name: "route-1"},
		Adapter: &imageAdapterStub{
			imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
				attempts++
				if attempts == 1 {
					return nil, errors.New("upstream boom")
				}
				return &adapter.ImageResult{URLs: []string{"https://example.com/retry-ok.png"}}, nil
			},
		},
	}

	got, err := imageGenerateWithRetry(context.Background(), rt, &adapter.ImageRequest{Prompt: "retry"})
	if err != nil {
		t.Fatalf("imageGenerateWithRetry error = %v", err)
	}
	if attempts != 2 {
		t.Fatalf("attempts = %d", attempts)
	}
	if got == nil || len(got.URLs) != 1 || got.URLs[0] != "https://example.com/retry-ok.png" {
		t.Fatalf("result = %#v", got)
	}
}

func TestActualCountReturnsZeroForEmptyImageResult(t *testing.T) {
	if got := actualCount(&adapter.ImageResult{}); got != 0 {
		t.Fatalf("actualCount(empty) = %d", got)
	}
}

func TestImageGenerateWithRetryCompletesFewerImagesThanRequested(t *testing.T) {
	requestedCounts := make([]int, 0, 2)
	rt := &channel.Route{
		Channel: &channel.Channel{ID: 1, Name: "route-1"},
		Adapter: &imageAdapterStub{
			imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
				requestedCounts = append(requestedCounts, req.N)
				if len(requestedCounts) == 1 {
					return &adapter.ImageResult{URLs: []string{"https://example.com/only-one.png"}}, nil
				}
				return &adapter.ImageResult{URLs: []string{
					"https://example.com/fill-1.png",
					"https://example.com/fill-2.png",
				}}, nil
			},
		},
	}

	got, err := imageGenerateWithRetry(context.Background(), rt, &adapter.ImageRequest{Prompt: "multi", N: 3})
	if err != nil {
		t.Fatalf("imageGenerateWithRetry error = %v", err)
	}
	if len(requestedCounts) != 2 || requestedCounts[0] != 3 || requestedCounts[1] != 2 {
		t.Fatalf("requested counts = %v", requestedCounts)
	}
	if got == nil || len(got.URLs) != 3 {
		t.Fatalf("result = %#v", got)
	}
	want := []string{
		"https://example.com/only-one.png",
		"https://example.com/fill-1.png",
		"https://example.com/fill-2.png",
	}
	for i := range want {
		if got.URLs[i] != want[i] {
			t.Fatalf("urls = %v", got.URLs)
		}
	}
}

func TestPickImageRouteSkipsRouteOnlyAfterSecondFailure(t *testing.T) {
	first := &imageAdapterStub{
		imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
			return nil, errors.New("first route upstream boom")
		},
	}
	second := &imageAdapterStub{
		imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
			return &adapter.ImageResult{B64s: []string{"abc"}}, nil
		},
	}
	routes := []*channel.Route{
		{Channel: &channel.Channel{ID: 1, Name: "route-1"}, Adapter: first},
		{Channel: &channel.Channel{ID: 2, Name: "route-2"}, Adapter: second},
	}

	selected, result, failures := pickImageRoute(context.Background(), routes, &adapter.ImageRequest{Prompt: "route switch"})
	if selected == nil || selected.Channel.ID != 2 {
		t.Fatalf("selected = %#v", selected)
	}
	if result == nil || len(result.B64s) != 1 || result.B64s[0] != "abc" {
		t.Fatalf("result = %#v", result)
	}
	if len(failures) != 1 {
		t.Fatalf("failures = %#v", failures)
	}
	if failures[0].route.Channel.ID != 1 {
		t.Fatalf("failure route = %#v", failures[0].route)
	}
	if first.Calls() != 2 {
		t.Fatalf("first route calls = %d", first.Calls())
	}
	if second.Calls() != 1 {
		t.Fatalf("second route calls = %d", second.Calls())
	}
}

func TestPickImageRouteSkipsEmptyImageResult(t *testing.T) {
	first := &imageAdapterStub{
		imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
			return &adapter.ImageResult{}, nil
		},
	}
	second := &imageAdapterStub{
		imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
			return &adapter.ImageResult{URLs: []string{"https://example.com/ok.png"}}, nil
		},
	}
	routes := []*channel.Route{
		{Channel: &channel.Channel{ID: 1, Name: "route-1"}, Adapter: first},
		{Channel: &channel.Channel{ID: 2, Name: "route-2"}, Adapter: second},
	}

	selected, result, failures := pickImageRoute(context.Background(), routes, &adapter.ImageRequest{Prompt: "empty route switch"})
	if selected == nil || selected.Channel.ID != 2 {
		t.Fatalf("selected = %#v", selected)
	}
	if result == nil || len(result.URLs) != 1 || result.URLs[0] != "https://example.com/ok.png" {
		t.Fatalf("result = %#v", result)
	}
	if len(failures) != 1 {
		t.Fatalf("failures = %#v", failures)
	}
	if first.Calls() != 2 {
		t.Fatalf("first route calls = %d", first.Calls())
	}
	if second.Calls() != 1 {
		t.Fatalf("second route calls = %d", second.Calls())
	}
}

func TestPickImageRouteReturnsLastFailureWhenAllRoutesFail(t *testing.T) {
	routes := []*channel.Route{
		{
			Channel: &channel.Channel{ID: 1, Name: "route-1"},
			Adapter: &imageAdapterStub{
				imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
					return nil, io.EOF
				},
			},
		},
		{
			Channel: &channel.Channel{ID: 2, Name: "route-2"},
			Adapter: &imageAdapterStub{
				imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
					return nil, errors.New("last upstream error")
				},
			},
		},
	}

	selected, result, failures := pickImageRoute(context.Background(), routes, &adapter.ImageRequest{Prompt: "all fail"})
	if selected != nil {
		t.Fatalf("selected = %#v", selected)
	}
	if result != nil {
		t.Fatalf("result = %#v", result)
	}
	if len(failures) != 2 {
		t.Fatalf("failures = %#v", failures)
	}
	if failures[1].err == nil || failures[1].err.Error() != "last upstream error" {
		t.Fatalf("last failure = %#v", failures[1].err)
	}
}

func TestImageGenerateWithRetryDoesNotRetryUnsupportedReferenceImages(t *testing.T) {
	attempts := 0
	rt := &channel.Route{
		Channel: &channel.Channel{ID: 1, Name: "route-1"},
		Adapter: &imageAdapterStub{
			imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
				attempts++
				return nil, adapter.ErrImageReferencesUnsupported
			},
		},
	}

	_, err := imageGenerateWithRetry(context.Background(), rt, &adapter.ImageRequest{
		Prompt: "reference test",
		References: []adapter.ImageReference{
			{URL: "https://img.example.com/ref.png"},
		},
	})
	if !errors.Is(err, adapter.ErrImageReferencesUnsupported) {
		t.Fatalf("err = %v, want ErrImageReferencesUnsupported", err)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestBuildChannelImageRequestUploadsReferenceImagesForCapableRoutes(t *testing.T) {
	uploader := &referenceUploaderStub{
		urls: []string{
			"https://img.example.com/uploaded-1.png",
			"https://img.example.com/uploaded-2.png",
		},
	}
	h := &ImagesHandler{referenceUploader: uploader}
	req := &ImageGenRequest{
		Model:  "gpt-5.4",
		Prompt: "换个风格",
		N:      1,
		Size:   "1024x1024",
	}
	routes := []*channel.Route{
		{
			Channel: &channel.Channel{ID: 1, Name: "responses-route"},
			Adapter: &referenceCapableImageAdapterStub{
				imageAdapterStub: imageAdapterStub{
					imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
						return &adapter.ImageResult{B64s: []string{"abc"}}, nil
					},
				},
			},
		},
		{
			Channel: &channel.Channel{ID: 2, Name: "fallback-route"},
			Adapter: &imageAdapterStub{
				imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
					return &adapter.ImageResult{B64s: []string{"abc"}}, nil
				},
			},
		},
	}
	refs := []image.ReferenceImage{
		{Data: []byte("first"), FileName: "first.png"},
		{Data: []byte("second"), FileName: "second.png"},
	}

	ir, filtered, err := h.buildChannelImageRequest(context.Background(), routes, req, refs)
	if err != nil {
		t.Fatalf("buildChannelImageRequest: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Channel.ID != 1 {
		t.Fatalf("filtered routes = %#v, want only capable route", filtered)
	}
	if ir == nil || len(ir.References) != 2 {
		t.Fatalf("image request references = %#v", ir)
	}
	if got := ir.References[0].URL; got != "https://img.example.com/uploaded-1.png" {
		t.Fatalf("references[0].URL = %q", got)
	}
	if got := ir.References[1].URL; got != "https://img.example.com/uploaded-2.png" {
		t.Fatalf("references[1].URL = %q", got)
	}
	if uploader.calls != 2 {
		t.Fatalf("uploader.calls = %d, want 2", uploader.calls)
	}
}

func TestBuildChannelImageRequestFallsBackWhenNoRouteSupportsReferenceImages(t *testing.T) {
	h := &ImagesHandler{}
	req := &ImageGenRequest{Model: "gpt-image-1", Prompt: "test"}
	routes := []*channel.Route{
		{
			Channel: &channel.Channel{ID: 1, Name: "non-capable-route"},
			Adapter: &imageAdapterStub{
				imageFn: func(ctx context.Context, upstreamModel string, req *adapter.ImageRequest) (*adapter.ImageResult, error) {
					return &adapter.ImageResult{B64s: []string{"abc"}}, nil
				},
			},
		},
	}
	refs := []image.ReferenceImage{{Data: []byte("first"), FileName: "first.png"}}

	_, _, err := h.buildChannelImageRequest(context.Background(), routes, req, refs)
	if !errors.Is(err, errNoReferenceCapableImageRoute) {
		t.Fatalf("err = %v, want errNoReferenceCapableImageRoute", err)
	}
}

func TestDispatchImageToChannelReturnsErrorWhenMappedRouteCannotAcceptReferenceImages(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := newImageChannelTestRouter(t, "https://img.example.com/v1/images/generations")
	h := &ImagesHandler{Handler: &Handler{Channels: router}}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)

	rec := &usage.Log{}
	handled := h.dispatchImageToChannel(
		c,
		&apikey.APIKey{ID: 1, UserID: 2},
		&modelpkg.Model{ID: 3, Slug: "gpt-image-1"},
		&ImageGenRequest{
			Model:  "gpt-image-1",
			Prompt: "换个风格",
			N:      1,
			Size:   "1024x1024",
		},
		[]image.ReferenceImage{{Data: []byte("demo"), FileName: "ref.png"}},
		rec,
		1,
	)

	if !handled {
		t.Fatalf("dispatchImageToChannel should handle unsupported reference routes")
	}
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadGateway)
	}
	if rec.Status != usage.StatusFailed {
		t.Fatalf("rec.Status = %q", rec.Status)
	}
	if rec.ErrorCode != "image_reference_unsupported" {
		t.Fatalf("rec.ErrorCode = %q", rec.ErrorCode)
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error.Code != "image_reference_unsupported" {
		t.Fatalf("error.code = %q", body.Error.Code)
	}
	if body.Error.Message == "" {
		t.Fatalf("error.message should not be empty")
	}
	if want := "/v1/responses"; !contains(body.Error.Message, want) {
		t.Fatalf("error.message = %q, want mention %q", body.Error.Message, want)
	}
}

func TestImageGenerationsRoutesReferenceImagesToResponsesChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var (
		gotPath string
		payload map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.output_item.done\n")
		_, _ = io.WriteString(w, "data: {\"item\":{\"type\":\"image_generation_call\",\"result\":\"ZmluYWw=\"}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	uploader := &referenceUploaderStub{
		urls: []string{
			"https://img.example.com/uploaded-1.png",
			"https://img.example.com/uploaded-2.png",
		},
	}
	h, ak := newChannelBackedImageHandlerForTest(
		t,
		newImageChannelTestRouterWithMapping(t, srv.URL+"/v1/responses", "gpt-image-1", "gpt-5.4"),
		uploader,
	)

	reqBody, err := json.Marshal(ImageGenRequest{
		Model:  "gpt-image-1",
		Prompt: "换个风格",
		N:      1,
		Size:   "1024x1024",
		ReferenceImages: []string{
			dataURLForTest([]byte("first-image")),
			dataURLForTest([]byte("second-image")),
		},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	c, recorder := newAuthedImageTestContext(http.MethodPost, "/v1/images/generations", bytes.NewReader(reqBody), "application/json", ak)
	h.ImageGenerations(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/v1/responses" {
		t.Fatalf("upstream path = %q, want /v1/responses", gotPath)
	}
	if uploader.calls != 2 {
		t.Fatalf("uploader.calls = %d, want 2", uploader.calls)
	}
	if string(uploader.sources[0].Data) != "first-image" {
		t.Fatalf("uploader.sources[0] = %q", string(uploader.sources[0].Data))
	}
	if string(uploader.sources[1].Data) != "second-image" {
		t.Fatalf("uploader.sources[1] = %q", string(uploader.sources[1].Data))
	}

	if got := payload["model"]; got != "gpt-5.4" {
		t.Fatalf("payload.model = %#v, want gpt-5.4", got)
	}
	content := mustResponsesContent(t, payload)
	if len(content) != 3 {
		t.Fatalf("content len = %d, want 3", len(content))
	}
	if got := content[0]["type"]; got != "input_text" {
		t.Fatalf("content[0].type = %#v, want input_text", got)
	}
	if got := content[0]["text"]; got != "换个风格" {
		t.Fatalf("content[0].text = %#v, want 换个风格", got)
	}
	if got := content[1]["image_url"]; got != "https://img.example.com/uploaded-1.png" {
		t.Fatalf("content[1].image_url = %#v", got)
	}
	if got := content[2]["image_url"]; got != "https://img.example.com/uploaded-2.png" {
		t.Fatalf("content[2].image_url = %#v", got)
	}

	var resp ImageGenResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode handler response: %v", err)
	}
	if len(resp.Data) != 1 {
		t.Fatalf("len(resp.Data) = %d, want 1", len(resp.Data))
	}
	if got := resp.Data[0].URL; got != "data:image/png;base64,ZmluYWw=" {
		t.Fatalf("resp.Data[0].URL = %q", got)
	}
}

func TestImageGenerationsArchivesChannelBase64ResultLocally(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const png1x1Base64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGL6z8DwnwEZAAIAAP//HxcCAa7PZcoAAAAASUVORK5CYII="
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\""+png1x1Base64+"\",\"output_format\":\"png\"}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	h, ak := newChannelBackedImageHandlerForTest(
		t,
		newImageChannelTestRouterWithMapping(t, srv.URL+"/v1/responses", "gpt-image-1", "gpt-5.4"),
		nil,
	)
	store := imagestore.NewLocal(imagestore.LocalOptions{RootDir: t.TempDir()})
	h.LocalImageStore = store
	h.Runner = image.NewRunner(nil, nil, config.ImageConfig{}, store)

	reqBody, err := json.Marshal(ImageGenRequest{
		Model:  "gpt-image-1",
		Prompt: "生成图片",
		N:      1,
		Size:   "1024x1024",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	c, recorder := newAuthedImageTestContext(http.MethodPost, "/v1/images/generations", bytes.NewReader(reqBody), "application/json", ak)
	h.ImageGenerations(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var resp ImageGenResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode handler response: %v", err)
	}
	if resp.TaskID == "" {
		t.Fatalf("task_id should be returned for archived channel images")
	}
	if len(resp.Data) != 1 {
		t.Fatalf("len(resp.Data) = %d, want 1", len(resp.Data))
	}
	if got := resp.Data[0].URL; got == "" || got == "data:image/png;base64,"+png1x1Base64 {
		t.Fatalf("response url should be archived proxy url, got %q", got)
	}
	if resp.Data[0].ThumbURL == "" || resp.Data[0].ThumbURL == resp.Data[0].URL {
		t.Fatalf("thumb_url should be archived proxy thumb url, got %#v", resp.Data[0])
	}
	if _, ok, err := store.FindOriginal(resp.TaskID, 0); err != nil || !ok {
		t.Fatalf("original image missing, ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.FindThumb(resp.TaskID, 0); err != nil || !ok {
		t.Fatalf("thumb image missing, ok=%v err=%v", ok, err)
	}
}

func TestImageGenerationsRecordsChannelURLResultWhenRunnerMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const upstreamURL = "https://cdn.example.com/generated.png"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"url":"`+upstreamURL+`"}]}`)
	}))
	defer srv.Close()

	taskDB := newImageTaskSQLiteDB(t)
	h, ak := newChannelBackedImageHandlerForTest(
		t,
		newImageChannelTestRouterWithMapping(t, srv.URL+"/v1/images/generations", "gpt-image-1", "gpt-image-1"),
		nil,
	)
	h.DAO = image.NewDAO(taskDB)
	h.Runner = nil
	h.referenceArchiveUploader = &referenceUploaderStub{
		urls: []string{
			"https://cdn.example.com/ref-1.png",
			"https://cdn.example.com/ref-1-thumb.jpg",
			"https://cdn.example.com/ref-2.png",
			"https://cdn.example.com/ref-2-thumb.jpg",
		},
	}

	reqBody, err := json.Marshal(ImageGenRequest{
		Model:  "gpt-image-1",
		Prompt: "生成图片",
		N:      1,
		Size:   "1024x1024",
		ReferenceImages: []string{
			dataURLForTest(mustChannelPNG(t, color.RGBA{R: 255, A: 255})),
			dataURLForTest(mustChannelPNG(t, color.RGBA{G: 255, A: 255})),
		},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	c, recorder := newAuthedImageTestContext(http.MethodPost, "/v1/images/generations", bytes.NewReader(reqBody), "application/json", ak)
	h.ImageGenerations(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var resp ImageGenResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.TaskID == "" {
		t.Fatalf("task_id should be returned for channel url results even when runner is missing")
	}
	if len(resp.Data) != 1 || resp.Data[0].URL != upstreamURL {
		t.Fatalf("response data = %#v", resp.Data)
	}

	var stored struct {
		TaskID             string `db:"task_id"`
		UserID             uint64 `db:"user_id"`
		KeyID              uint64 `db:"key_id"`
		Prompt             string `db:"prompt"`
		Status             string `db:"status"`
		StorageMode        string `db:"storage_mode"`
		ResultURLs         string `db:"result_urls"`
		ReferenceURLs      string `db:"reference_urls"`
		ReferenceThumbURLs string `db:"reference_thumb_urls"`
		ReferenceCount     int    `db:"reference_count"`
	}
	if err := taskDB.Get(&stored, `SELECT task_id, user_id, key_id, prompt, status, storage_mode, result_urls, reference_urls, reference_thumb_urls, reference_count FROM image_tasks WHERE task_id = ?`, resp.TaskID); err != nil {
		t.Fatalf("select stored task: %v", err)
	}
	if stored.UserID != ak.UserID || stored.KeyID != ak.ID {
		t.Fatalf("stored owner = user:%d key:%d, want user:%d key:%d", stored.UserID, stored.KeyID, ak.UserID, ak.ID)
	}
	if stored.Prompt != "生成图片" {
		t.Fatalf("stored prompt = %q", stored.Prompt)
	}
	if stored.Status != image.StatusSuccess {
		t.Fatalf("stored status = %q", stored.Status)
	}
	if stored.StorageMode != image.StorageModeCloud {
		t.Fatalf("stored storage_mode = %q, want cloud", stored.StorageMode)
	}
	if stored.ResultURLs != `["`+upstreamURL+`"]` {
		t.Fatalf("stored result_urls = %q", stored.ResultURLs)
	}
	if stored.ReferenceCount != 2 {
		t.Fatalf("stored reference_count = %d", stored.ReferenceCount)
	}
	if stored.ReferenceURLs != `["https://cdn.example.com/ref-1.png","https://cdn.example.com/ref-2.png"]` {
		t.Fatalf("stored reference_urls = %q", stored.ReferenceURLs)
	}
	if stored.ReferenceThumbURLs != `["https://cdn.example.com/ref-1-thumb.jpg","https://cdn.example.com/ref-2-thumb.jpg"]` {
		t.Fatalf("stored reference_thumb_urls = %q", stored.ReferenceThumbURLs)
	}
}

func TestImageGenerationsCreatesChannelTaskBeforeUpstreamReturns(t *testing.T) {
	gin.SetMode(gin.TestMode)

	upstreamStarted := make(chan struct{}, 1)
	releaseUpstream := make(chan struct{})
	var releaseOnce sync.Once
	release := func() {
		releaseOnce.Do(func() {
			close(releaseUpstream)
		})
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case upstreamStarted <- struct{}{}:
		default:
		}
		<-releaseUpstream
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"url":"https://cdn.example.com/generated.png"}]}`)
	}))
	defer srv.Close()

	taskDB := newImageTaskSQLiteDB(t)
	h, ak := newChannelBackedImageHandlerForTest(
		t,
		newImageChannelTestRouterWithMapping(t, srv.URL+"/v1/images/generations", "gpt-image-1", "gpt-image-1"),
		nil,
	)
	h.DAO = image.NewDAO(taskDB)
	h.Runner = nil

	reqBody, err := json.Marshal(ImageGenRequest{
		Model:  "gpt-image-1",
		Prompt: "生成图片",
		N:      1,
		Size:   "1024x1024",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	c, recorder := newAuthedImageTestContext(http.MethodPost, "/v1/images/generations", bytes.NewReader(reqBody), "application/json", ak)

	done := make(chan struct{})
	go func() {
		defer close(done)
		h.ImageGenerations(c)
	}()
	defer func() {
		release()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Error("timed out waiting for handler completion during cleanup")
		}
	}()

	select {
	case <-upstreamStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for upstream request")
	}

	var pending struct {
		TaskID string `db:"task_id"`
		Status string `db:"status"`
		Prompt string `db:"prompt"`
	}
	if err := taskDB.Get(&pending, `SELECT task_id, status, prompt FROM image_tasks ORDER BY id DESC LIMIT 1`); err != nil {
		t.Fatalf("select pending task: %v", err)
	}
	if pending.TaskID == "" {
		t.Fatalf("pending task_id should not be empty")
	}
	if pending.Status != image.StatusDispatched {
		t.Fatalf("pending status = %q, want %q", pending.Status, image.StatusDispatched)
	}
	if pending.Prompt != "生成图片" {
		t.Fatalf("pending prompt = %q", pending.Prompt)
	}

	release()

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestImageEditsRoutesMultipartReferenceImagesToResponsesChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var (
		gotPath string
		payload map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.output_item.done\n")
		_, _ = io.WriteString(w, "data: {\"item\":{\"type\":\"image_generation_call\",\"result\":\"bXVsdGktcmVmLWZpbmFs\"}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	uploader := &referenceUploaderStub{
		urls: []string{
			"https://img.example.com/edit-1.png",
			"https://img.example.com/edit-2.png",
			"https://img.example.com/edit-3.png",
		},
	}
	h, ak := newChannelBackedImageHandlerForTest(
		t,
		newImageChannelTestRouterWithMapping(t, srv.URL+"/v1/responses", "gpt-image-1", "gpt-5.4"),
		uploader,
	)
	taskDB := newImageTaskSQLiteDB(t)
	h.DAO = image.NewDAO(taskDB)
	h.referenceArchiveUploader = &referenceUploaderStub{
		urls: []string{
			"https://cdn.example.com/archive-ref-1.png",
			"https://cdn.example.com/archive-ref-1-thumb.jpg",
			"https://cdn.example.com/archive-ref-2.png",
			"https://cdn.example.com/archive-ref-2-thumb.jpg",
			"https://cdn.example.com/archive-ref-3.png",
			"https://cdn.example.com/archive-ref-3-thumb.jpg",
		},
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("model", "gpt-image-1"); err != nil {
		t.Fatalf("write model field: %v", err)
	}
	if err := writer.WriteField("prompt", "换个风格"); err != nil {
		t.Fatalf("write prompt field: %v", err)
	}
	if err := writer.WriteField("size", "1024x1024"); err != nil {
		t.Fatalf("write size field: %v", err)
	}
	firstPNG := mustChannelPNG(t, color.RGBA{R: 255, A: 255})
	secondPNG := mustChannelPNG(t, color.RGBA{G: 255, A: 255})
	thirdPNG := mustChannelPNG(t, color.RGBA{B: 255, A: 255})
	writeMultipartFile(t, writer, "image", "first.png", firstPNG)
	writeMultipartFile(t, writer, "image[]", "second.png", secondPNG)
	writeMultipartFile(t, writer, "image[]", "third.png", thirdPNG)
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	c, recorder := newAuthedImageTestContext(http.MethodPost, "/v1/images/edits", &body, writer.FormDataContentType(), ak)
	h.ImageEdits(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/v1/responses" {
		t.Fatalf("upstream path = %q, want /v1/responses", gotPath)
	}
	if uploader.calls != 3 {
		t.Fatalf("uploader.calls = %d, want 3", uploader.calls)
	}
	if !bytes.Equal(uploader.sources[0].Data, firstPNG) {
		t.Fatalf("uploader.sources[0] bytes mismatch")
	}
	if !bytes.Equal(uploader.sources[1].Data, secondPNG) {
		t.Fatalf("uploader.sources[1] bytes mismatch")
	}
	if !bytes.Equal(uploader.sources[2].Data, thirdPNG) {
		t.Fatalf("uploader.sources[2] bytes mismatch")
	}

	content := mustResponsesContent(t, payload)
	if len(content) != 4 {
		t.Fatalf("content len = %d, want 4", len(content))
	}
	if got := content[0]["text"]; got != "换个风格" {
		t.Fatalf("content[0].text = %#v, want 换个风格", got)
	}
	if got := content[1]["image_url"]; got != "https://img.example.com/edit-1.png" {
		t.Fatalf("content[1].image_url = %#v", got)
	}
	if got := content[2]["image_url"]; got != "https://img.example.com/edit-2.png" {
		t.Fatalf("content[2].image_url = %#v", got)
	}
	if got := content[3]["image_url"]; got != "https://img.example.com/edit-3.png" {
		t.Fatalf("content[3].image_url = %#v", got)
	}

	var resp ImageGenResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode handler response: %v", err)
	}
	if resp.TaskID == "" {
		t.Fatalf("task_id should be returned for channel edit tasks")
	}
	if len(resp.Data) != 1 {
		t.Fatalf("len(resp.Data) = %d, want 1", len(resp.Data))
	}
	if got := resp.Data[0].URL; got != "data:image/png;base64,bXVsdGktcmVmLWZpbmFs" {
		t.Fatalf("resp.Data[0].URL = %q", got)
	}
	var stored struct {
		ReferenceCount     int    `db:"reference_count"`
		ReferenceURLs      string `db:"reference_urls"`
		ReferenceThumbURLs string `db:"reference_thumb_urls"`
	}
	if err := taskDB.Get(&stored, `SELECT reference_count, reference_urls, reference_thumb_urls FROM image_tasks WHERE task_id = ?`, resp.TaskID); err != nil {
		t.Fatalf("select stored task: %v", err)
	}
	if stored.ReferenceCount != 3 {
		t.Fatalf("stored reference_count = %d", stored.ReferenceCount)
	}
	if stored.ReferenceURLs != `["https://cdn.example.com/archive-ref-1.png","https://cdn.example.com/archive-ref-2.png","https://cdn.example.com/archive-ref-3.png"]` {
		t.Fatalf("stored reference_urls = %q", stored.ReferenceURLs)
	}
	if stored.ReferenceThumbURLs != `["https://cdn.example.com/archive-ref-1-thumb.jpg","https://cdn.example.com/archive-ref-2-thumb.jpg","https://cdn.example.com/archive-ref-3-thumb.jpg"]` {
		t.Fatalf("stored reference_thumb_urls = %q", stored.ReferenceThumbURLs)
	}
}

func newImageChannelTestRouter(t *testing.T, baseURL string) *channel.Router {
	return newImageChannelTestRouterWithMapping(t, baseURL, "gpt-image-1", "gpt-image-1")
}

func newImageChannelTestRouterWithMapping(t *testing.T, baseURL, localModel, upstreamModel string) *channel.Router {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	for _, stmt := range []string{
		`CREATE TABLE upstream_channels (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			base_url TEXT NOT NULL,
			api_key_enc TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 100,
			weight INTEGER NOT NULL DEFAULT 1,
			timeout_s INTEGER NOT NULL DEFAULT 120,
			ratio REAL NOT NULL DEFAULT 1,
			extra TEXT NULL,
			status TEXT NOT NULL DEFAULT 'healthy',
			fail_count INTEGER NOT NULL DEFAULT 0,
			last_test_at DATETIME NULL,
			last_test_ok INTEGER NULL,
			last_test_error TEXT NOT NULL DEFAULT '',
			remark TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE channel_model_mappings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id INTEGER NOT NULL,
			local_model TEXT NOT NULL,
			upstream_model TEXT NOT NULL,
			modality TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 100,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}

	cipher, err := crypto.NewAESGCM("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("new cipher: %v", err)
	}
	apiKeyEnc, err := cipher.EncryptString("test-key")
	if err != nil {
		t.Fatalf("encrypt key: %v", err)
	}

	now := time.Now()
	res, err := db.Exec(
		`INSERT INTO upstream_channels
			(name, type, base_url, api_key_enc, enabled, priority, weight, timeout_s, ratio, extra, status, fail_count, last_test_error, remark, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 1, 1, 1, 30, 1, ?, 'healthy', 0, '', '', ?, ?)`,
		"img-route", channel.TypeOpenAI, baseURL, apiKeyEnc, sql.NullString{}, now, now,
	)
	if err != nil {
		t.Fatalf("insert channel: %v", err)
	}
	channelID, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("channel id: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO channel_model_mappings
			(channel_id, local_model, upstream_model, modality, enabled, priority, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
		channelID, localModel, upstreamModel, channel.ModalityImage, now, now,
	); err != nil {
		t.Fatalf("insert mapping: %v", err)
	}

	return channel.NewRouter(channel.NewService(channel.NewDAO(db), cipher))
}

func newChannelBackedImageHandlerForTest(t *testing.T, router *channel.Router, uploader *referenceUploaderStub) (*ImagesHandler, *apikey.APIKey) {
	t.Helper()

	models, keys, ak := newImageHandlerRuntimeDeps(t)
	return &ImagesHandler{
		Handler: &Handler{
			Models:   models,
			Keys:     keys,
			Channels: router,
		},
		referenceUploader: uploader,
	}, ak
}

func newImageHandlerRuntimeDeps(t *testing.T) (*modelpkg.Registry, *apikey.Service, *apikey.APIKey) {
	t.Helper()

	db := sqlx.MustOpen("sqlite3", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	for _, stmt := range []string{
		`CREATE TABLE models (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			slug TEXT NOT NULL UNIQUE,
			type TEXT NOT NULL,
			upstream_model_slug TEXT NOT NULL,
			input_price_per_1m INTEGER NOT NULL DEFAULT 0,
			output_price_per_1m INTEGER NOT NULL DEFAULT 0,
			cache_read_price_per_1m INTEGER NOT NULL DEFAULT 0,
			image_price_per_call INTEGER NOT NULL DEFAULT 0,
			image_price_per_call_2k INTEGER NOT NULL DEFAULT 0,
			image_price_per_call_4k INTEGER NOT NULL DEFAULT 0,
			supports_multi_image INTEGER NOT NULL DEFAULT 1,
			supports_output_size INTEGER NOT NULL DEFAULT 1,
			description TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
		`CREATE TABLE api_keys (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			key_prefix TEXT NOT NULL,
			key_hash TEXT NOT NULL,
			quota_limit INTEGER NOT NULL DEFAULT 0,
			quota_used INTEGER NOT NULL DEFAULT 0,
			allowed_models TEXT NULL,
			allowed_ips TEXT NULL,
			rpm INTEGER NOT NULL DEFAULT 0,
			tpm INTEGER NOT NULL DEFAULT 0,
			expires_at DATETIME NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			last_used_at DATETIME NULL,
			last_used_ip TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME NULL
		)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}

	ctx := context.Background()
	modelDAO := modelpkg.NewDAO(db)
	if err := modelDAO.Create(ctx, &modelpkg.Model{
		Slug:               "gpt-image-1",
		Type:               modelpkg.TypeImage,
		UpstreamModelSlug:  "gpt-5.4",
		ImagePricePerCall:  0,
		SupportsMultiImage: true,
		SupportsOutputSize: true,
		Enabled:            true,
	}); err != nil {
		t.Fatalf("create image model: %v", err)
	}
	models := modelpkg.NewRegistry(modelDAO)
	if err := models.Preload(ctx); err != nil {
		t.Fatalf("preload models: %v", err)
	}

	keySvc := apikey.NewService(apikey.NewDAO(db))
	gen, err := keySvc.Create(ctx, 2, apikey.CreateInput{Name: "test-image-key"})
	if err != nil {
		t.Fatalf("create api key: %v", err)
	}

	return models, keySvc, gen.Record
}

func newAuthedImageTestContext(method, target string, body io.Reader, contentType string, ak *apikey.APIKey) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(method, target, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.RemoteAddr = "127.0.0.1:34567"
	c.Request = req
	c.Set(apikey.CtxKey, ak)
	return c, recorder
}

func mustResponsesContent(t *testing.T, payload map[string]any) []map[string]any {
	t.Helper()

	input, ok := payload["input"].([]any)
	if !ok || len(input) != 1 {
		t.Fatalf("payload.input = %#v, want one user message", payload["input"])
	}
	msg, ok := input[0].(map[string]any)
	if !ok {
		t.Fatalf("payload.input[0] = %#v, want map", input[0])
	}
	content, ok := msg["content"].([]any)
	if !ok {
		t.Fatalf("payload.input[0].content = %#v, want array", msg["content"])
	}
	out := make([]map[string]any, 0, len(content))
	for i, item := range content {
		part, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("content[%d] = %#v, want map", i, item)
		}
		out = append(out, part)
	}
	return out
}

func dataURLForTest(data []byte) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func writeMultipartFile(t *testing.T, writer *multipart.Writer, field, name string, data []byte) {
	t.Helper()

	part, err := writer.CreateFormFile(field, name)
	if err != nil {
		t.Fatalf("create form file %s: %v", field, err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write form file %s: %v", field, err)
	}
}

func mustChannelPNG(t *testing.T, c color.RGBA) []byte {
	t.Helper()

	img := stdimage.NewRGBA(stdimage.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || containsIndex(s, sub) >= 0))
}

func containsIndex(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

var registerImageTaskSQLiteDriverOnce sync.Once

func newImageTaskSQLiteDB(t *testing.T) *sqlx.DB {
	t.Helper()

	registerImageTaskSQLiteDriverOnce.Do(func() {
		sql.Register("sqlite3_image_channel_now", &sqlite3.SQLiteDriver{
			ConnectHook: func(conn *sqlite3.SQLiteConn) error {
				return conn.RegisterFunc("NOW", func() string {
					return time.Now().Format("2006-01-02 15:04:05")
				}, true)
			},
		})
	})

	db := sqlx.MustOpen("sqlite3_image_channel_now", ":memory:")
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`CREATE TABLE image_tasks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		task_id TEXT NOT NULL UNIQUE,
		user_id INTEGER NOT NULL,
		key_id INTEGER NOT NULL DEFAULT 0,
		model_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL DEFAULT 0,
		prompt TEXT NOT NULL,
		n INTEGER NOT NULL DEFAULT 1,
		size TEXT NOT NULL DEFAULT '1024x1024',
		upscale TEXT NOT NULL DEFAULT '',
		storage_mode TEXT NOT NULL DEFAULT 'local',
		status TEXT NOT NULL DEFAULT 'queued',
		conversation_id TEXT NOT NULL DEFAULT '',
		file_ids TEXT NULL,
		result_urls TEXT NULL,
		thumb_urls TEXT NULL,
		reference_count INTEGER NOT NULL DEFAULT 0,
		reference_urls TEXT NULL,
		reference_thumb_urls TEXT NULL,
		error TEXT NOT NULL DEFAULT '',
		estimated_credit INTEGER NOT NULL DEFAULT 0,
		credit_cost INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		started_at DATETIME NULL,
		finished_at DATETIME NULL,
		deleted_at DATETIME NULL
	)`); err != nil {
		t.Fatalf("create image_tasks schema: %v", err)
	}

	return db
}
