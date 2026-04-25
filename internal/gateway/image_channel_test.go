package gateway

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"github.com/432539/gpt2api/internal/channel"
	"github.com/432539/gpt2api/internal/upstream/adapter"
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
