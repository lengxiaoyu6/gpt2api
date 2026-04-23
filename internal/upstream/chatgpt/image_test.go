package chatgpt

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestPollConversationForImagesReturnsSuccessWhenPreviewObserved(t *testing.T) {
	srv := newConversationServer([]map[string]interface{}{
		conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
		conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
		conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
	})
	defer srv.Close()

	cli := newTestClient(srv)
	status, fids, sids := cli.PollConversationForImages(context.Background(), "conv-1", PollOpts{
		MaxWait:  80 * time.Millisecond,
		Interval: 5 * time.Millisecond,
	})

	if status != PollStatusSuccess {
		t.Fatalf("status = %s", status)
	}
	if len(fids) != 0 {
		t.Fatalf("unexpected file ids: %v", fids)
	}
	if !reflect.DeepEqual(sids, []string{"sed_preview"}) {
		t.Fatalf("sediment ids = %v", sids)
	}
}

func TestPollConversationForImagesReturnsSuccessAfterCollectingExpectedRefs(t *testing.T) {
	srv := newConversationServer([]map[string]interface{}{
		conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
		conversationWithToolMessages(
			toolMessage("msg-preview", 1, nil, []string{"sed_preview"}),
			toolMessage("msg-final", 2, []string{"file_final"}, []string{"sed_preview"}),
		),
	})
	defer srv.Close()

	cli := newTestClient(srv)
	status, fids, sids := cli.PollConversationForImages(context.Background(), "conv-1", PollOpts{
		ExpectedN: 2,
		MaxWait:   80 * time.Millisecond,
		Interval:  5 * time.Millisecond,
	})

	if status != PollStatusSuccess {
		t.Fatalf("status = %s", status)
	}
	if !reflect.DeepEqual(fids, []string{"file_final"}) {
		t.Fatalf("file ids = %v", fids)
	}
	if !reflect.DeepEqual(sids, []string{"sed_preview"}) {
		t.Fatalf("sediment ids = %v", sids)
	}
}

func newTestClient(srv *httptest.Server) *Client {
	return &Client{
		opts: Options{
			BaseURL:       srv.URL,
			AuthToken:     "token",
			DeviceID:      "did",
			UserAgent:     DefaultUserAgent,
			ClientVersion: DefaultClientVersion,
			Language:      DefaultLanguage,
		},
		hc: srv.Client(),
	}
}

func toolMessage(id string, createTime float64, fileIDs []string, sedimentIDs []string) map[string]interface{} {
	parts := make([]interface{}, 0, len(fileIDs)+len(sedimentIDs))
	for _, fid := range fileIDs {
		parts = append(parts, fmt.Sprintf("file-service://%s", fid))
	}
	for _, sid := range sedimentIDs {
		parts = append(parts, fmt.Sprintf("sediment://%s", sid))
	}
	return map[string]interface{}{
		"id":          id,
		"create_time": createTime,
		"recipient":   "all",
		"author": map[string]interface{}{
			"role": "tool",
			"name": "dalle.text2im",
		},
		"metadata": map[string]interface{}{
			"async_task_type": "image_gen",
			"model_slug":      "gpt-image-1",
		},
		"content": map[string]interface{}{
			"content_type": "multimodal_text",
			"parts":        parts,
		},
	}
}

func conversationWithToolMessages(msgs ...map[string]interface{}) map[string]interface{} {
	mapping := make(map[string]interface{}, len(msgs))
	for _, msg := range msgs {
		mapping[msg["id"].(string)] = map[string]interface{}{"message": msg}
	}
	return map[string]interface{}{
		"current_node": msgs[len(msgs)-1]["id"].(string),
		"mapping":      mapping,
	}
}

func newConversationServer(responses []map[string]interface{}) *httptest.Server {
	var mu sync.Mutex
	idx := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if idx >= len(responses) {
			idx = len(responses) - 1
		}
		if err := json.NewEncoder(w).Encode(responses[idx]); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		idx++
	}))
}
