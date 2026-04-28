package adapter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/432539/gpt2api/internal/upstream/chatgpt"
)

func TestOpenAIImageGenerateUsesConfiguredEndpointURL(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if gotPath != "/v1/images/generations" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"https://example.test/image.png"}]}`))
	}))
	defer srv.Close()

	a := NewOpenAI(Params{
		BaseURL: srv.URL + "/v1/images/generations",
		APIKey:  "test",
	})
	_, err := a.ImageGenerate(context.Background(), "gpt-image-1", &ImageRequest{
		Prompt: "prompt",
		N:      1,
	})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if gotPath != "/v1/images/generations" {
		t.Fatalf("path = %s, want /v1/images/generations", gotPath)
	}
}

func TestOpenAIChatUsesConfiguredEndpointURL(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if gotPath != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"choices":[{"message":{"content":"pong"},"finish_reason":"stop"}],
			"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}
		}`))
	}))
	defer srv.Close()

	a := NewOpenAI(Params{
		BaseURL: srv.URL + "/v1/chat/completions",
		APIKey:  "test",
	})
	stream, err := a.Chat(context.Background(), "gpt-5", &ChatRequest{
		Messages: nil,
		Stream:   false,
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	for range stream {
	}
	if gotPath != "/v1/chat/completions" {
		t.Fatalf("path = %s, want /v1/chat/completions", gotPath)
	}
}

func TestOpenAIPingUsesConfiguredEndpointURL(t *testing.T) {
	var gotMethod string
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		if gotMethod != http.MethodHead {
			t.Fatalf("method = %s, want HEAD", gotMethod)
		}
		if gotPath != "/v1/images/generations" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer srv.Close()

	a := NewOpenAI(Params{
		BaseURL: srv.URL + "/v1/images/generations",
		APIKey:  "test",
	})
	if err := a.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
	if gotPath != "/v1/images/generations" {
		t.Fatalf("path = %s, want /v1/images/generations", gotPath)
	}
}

func TestOpenAIImageGenerateOmitsEmptySize(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"https://example.test/image.png"}]}`))
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL, APIKey: "test"})
	_, err := a.ImageGenerate(context.Background(), "gpt-image-1", &ImageRequest{
		Prompt: "prompt",
		N:      1,
	})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if _, ok := payload["size"]; ok {
		t.Fatalf("payload contains size when request size is empty: %#v", payload["size"])
	}
}

func TestOpenAIImageGenerateSendsProvidedSize(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"https://example.test/image.png"}]}`))
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL, APIKey: "test"})
	_, err := a.ImageGenerate(context.Background(), "gpt-image-1", &ImageRequest{
		Prompt: "prompt",
		N:      1,
		Size:   "3840x2160",
	})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if got := payload["size"]; got != "3840x2160" {
		t.Fatalf("size = %#v, want 3840x2160", got)
	}
}

func TestOpenAIImageGenerateResponsesEndpointSendsImageToolPayload(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\"cGFydGlhbA==\",\"output_format\":\"png\",\"background\":\"opaque\"}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	result, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{
		Prompt: "赛博朋克城市",
		N:      1,
		Size:   "3840x2160",
	})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if len(result.B64s) != 1 || result.B64s[0] != "cGFydGlhbA==" {
		t.Fatalf("result.B64s = %#v, want partial image payload", result.B64s)
	}
	if got := payload["model"]; got != "gpt-5.4" {
		t.Fatalf("model = %#v, want gpt-5.4", got)
	}
	if got := payload["stream"]; got != true {
		t.Fatalf("stream = %#v, want true", got)
	}
	if _, ok := payload["prompt"]; ok {
		t.Fatalf("responses payload should not use prompt field: %#v", payload["prompt"])
	}
	input, ok := payload["input"].([]any)
	if !ok || len(input) != 1 {
		t.Fatalf("input = %#v, want one user message", payload["input"])
	}
	msg, ok := input[0].(map[string]any)
	if !ok {
		t.Fatalf("input[0] = %#v, want map", input[0])
	}
	if got := msg["role"]; got != "user" {
		t.Fatalf("input role = %#v, want user", got)
	}
	content, ok := msg["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("content = %#v, want one input_text item", msg["content"])
	}
	part, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("content[0] = %#v, want map", content[0])
	}
	if got := part["type"]; got != "input_text" {
		t.Fatalf("content type = %#v, want input_text", got)
	}
	if got := part["text"]; got != "赛博朋克城市" {
		t.Fatalf("content text = %#v, want prompt", got)
	}
	tools, ok := payload["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("tools = %#v, want one image_generation tool", payload["tools"])
	}
	tool, ok := tools[0].(map[string]any)
	if !ok {
		t.Fatalf("tools[0] = %#v, want map", tools[0])
	}
	if got := tool["type"]; got != "image_generation" {
		t.Fatalf("tool type = %#v, want image_generation", got)
	}
	if got := tool["size"]; got != "3840x2160" {
		t.Fatalf("tool size = %#v, want 3840x2160", got)
	}
	if got := tool["quality"]; got != "high" {
		t.Fatalf("tool quality = %#v, want high", got)
	}
	choice, ok := payload["tool_choice"].(map[string]any)
	if !ok {
		t.Fatalf("tool_choice = %#v, want map", payload["tool_choice"])
	}
	if got := choice["type"]; got != "image_generation" {
		t.Fatalf("tool_choice.type = %#v, want image_generation", got)
	}
}

func TestOpenAIImageGenerateResponsesEndpointIncludesReferenceImages(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.output_item.done\n")
		_, _ = io.WriteString(w, "data: {\"item\":{\"type\":\"image_generation_call\",\"result\":\"ZmluYWw=\"}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	_, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{
		Prompt: "换个风格",
		Size:   "1024x1024",
		References: []ImageReference{
			{URL: "https://img.example.com/ref-1.png"},
			{URL: "https://img.example.com/ref-2.png"},
		},
	})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	input, ok := payload["input"].([]any)
	if !ok || len(input) != 1 {
		t.Fatalf("input = %#v, want one user message", payload["input"])
	}
	msg, ok := input[0].(map[string]any)
	if !ok {
		t.Fatalf("input[0] = %#v, want map", input[0])
	}
	content, ok := msg["content"].([]any)
	if !ok || len(content) != 3 {
		t.Fatalf("content = %#v, want input_text + 2 input_image items", msg["content"])
	}
	if got := content[0].(map[string]any)["type"]; got != "input_text" {
		t.Fatalf("content[0].type = %#v, want input_text", got)
	}
	if got := content[1].(map[string]any)["image_url"]; got != "https://img.example.com/ref-1.png" {
		t.Fatalf("content[1].image_url = %#v", got)
	}
	if got := content[2].(map[string]any)["image_url"]; got != "https://img.example.com/ref-2.png" {
		t.Fatalf("content[2].image_url = %#v", got)
	}
}

func TestOpenAIImageGenerateResponsesEndpointRejectsPartialOnlyResultWhenReferenceImagesPresent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\"cGFydGlhbA==\"}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	_, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{
		Prompt: "换个风格",
		References: []ImageReference{
			{URL: "https://img.example.com/ref-1.png"},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "empty image response") {
		t.Fatalf("err = %v, want empty image response", err)
	}
}

func TestOpenAIImageGenerateResponsesEndpointParsesPartialImage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\"cGFydGlhbA==\",\"output_format\":\"png\"}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	result, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{Prompt: "prompt"})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if len(result.B64s) != 1 || result.B64s[0] != "cGFydGlhbA==" {
		t.Fatalf("result.B64s = %#v, want partial image b64", result.B64s)
	}
}

func TestOpenAIImageGenerateResponsesEndpointReturnsPartialImageWhenStreamTimesOutAfterData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\"cGFydGlhbA==\",\"output_format\":\"png\"}\n\n")
		if flusher != nil {
			flusher.Flush()
		}
		time.Sleep(1500 * time.Millisecond)
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test", TimeoutS: 1})
	result, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{Prompt: "prompt"})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if len(result.B64s) != 1 || result.B64s[0] != "cGFydGlhbA==" {
		t.Fatalf("result.B64s = %#v, want partial image b64", result.B64s)
	}
}

func TestOpenAIImageGenerateResponsesEndpointWaitsPastClientTimeoutForFirstPartialImage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		time.Sleep(1500 * time.Millisecond)
		_, _ = io.WriteString(w, "event: response.image_generation_call.partial_image\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.image_generation_call.partial_image\",\"partial_image_b64\":\"cGFydGlhbA==\",\"output_format\":\"png\"}\n\n")
		if flusher != nil {
			flusher.Flush()
		}
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test", TimeoutS: 1})
	result, err := a.ImageGenerate(context.Background(), "gpt-5.4", &ImageRequest{Prompt: "prompt"})
	if err != nil {
		t.Fatalf("ImageGenerate: %v", err)
	}
	if len(result.B64s) != 1 || result.B64s[0] != "cGFydGlhbA==" {
		t.Fatalf("result.B64s = %#v, want partial image b64", result.B64s)
	}
}


func TestOpenAIImageGenerateRejectsReferenceImagesForGenerationsEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("request should not be sent to /v1/images/generations when reference images are unsupported")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/images/generations", APIKey: "test"})
	_, err := a.ImageGenerate(context.Background(), "gpt-image-1", &ImageRequest{
		Prompt: "换个风格",
		References: []ImageReference{
			{URL: "https://img.example.com/ref-1.png"},
		},
	})
	if !errors.Is(err, ErrImageReferencesUnsupported) {
		t.Fatalf("err = %v, want ErrImageReferencesUnsupported", err)
	}
}

func TestOpenAIChatResponsesEndpointUsesInputPayload(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{
			"status":"completed",
			"output":[
				{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}
			],
			"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}
		}`)
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	stream, err := a.Chat(context.Background(), "gpt-5.4", &ChatRequest{
		Messages:  []chatgpt.ChatMessage{{Role: "user", Content: "ping"}},
		Stream:    false,
		MaxTokens: 12,
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	text, finish, usage := collectChatStream(t, stream)
	if text != "pong" {
		t.Fatalf("text = %q, want pong", text)
	}
	if finish != "stop" {
		t.Fatalf("finish = %q, want stop", finish)
	}
	if usage == nil || usage.TotalTokens != 2 {
		t.Fatalf("usage = %#v, want total_tokens=2", usage)
	}
	if _, ok := payload["messages"]; ok {
		t.Fatalf("responses payload should not use messages: %#v", payload["messages"])
	}
	input, ok := payload["input"].([]any)
	if !ok || len(input) != 1 {
		t.Fatalf("input = %#v, want one user message", payload["input"])
	}
	msg := input[0].(map[string]any)
	content := msg["content"].([]any)
	part := content[0].(map[string]any)
	if got := part["text"]; got != "ping" {
		t.Fatalf("content text = %#v, want ping", got)
	}
	if got := payload["max_output_tokens"]; got != float64(12) {
		t.Fatalf("max_output_tokens = %#v, want 12", got)
	}
}

func TestOpenAIChatResponsesEndpointParsesStreamText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: response.output_text.delta\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hel\"}\n\n")
		_, _ = io.WriteString(w, "event: response.output_text.delta\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.output_text.delta\",\"delta\":\"lo\"}\n\n")
		_, _ = io.WriteString(w, "event: response.completed\n")
		_, _ = io.WriteString(w, "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":3,\"output_tokens\":2,\"total_tokens\":5}}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	stream, err := a.Chat(context.Background(), "gpt-5.4", &ChatRequest{
		Messages: []chatgpt.ChatMessage{{Role: "user", Content: "say hello"}},
		Stream:   true,
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	text, finish, usage := collectChatStream(t, stream)
	if text != "hello" {
		t.Fatalf("text = %q, want hello", text)
	}
	if finish != "stop" {
		t.Fatalf("finish = %q, want stop", finish)
	}
	if usage == nil || usage.CompletionTokens != 2 {
		t.Fatalf("usage = %#v, want completion_tokens=2", usage)
	}
}

func TestOpenAIPingResponsesEndpointUsesPostProbe(t *testing.T) {
	var methods []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.Method+" "+r.URL.Path)
		if r.URL.Path != "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"message":"missing required field"}}`)
	}))
	defer srv.Close()

	a := NewOpenAI(Params{BaseURL: srv.URL + "/v1/responses", APIKey: "test"})
	if err := a.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
	if len(methods) != 1 || methods[0] != "POST /v1/responses" {
		t.Fatalf("methods = %#v, want one POST /v1/responses probe", methods)
	}
}

func collectChatStream(t *testing.T, stream ChatStream) (string, string, *ChatUsage) {
	t.Helper()
	var text strings.Builder
	finish := ""
	var usage *ChatUsage
	for chunk := range stream {
		if chunk.Err != nil {
			t.Fatalf("stream err: %v", chunk.Err)
		}
		text.WriteString(chunk.Delta)
		if chunk.FinishReason != "" {
			finish = chunk.FinishReason
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
	}
	return text.String(), finish, usage
}
