package adapter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/432539/gpt2api/internal/upstream/chatgpt"
)

// openaiAdapter 兼容 OpenAI /v1/chat/completions、/v1/images/generations、/v1/responses。
//
// 许多第三方中转/聚合站(one-api、new-api、deepseek 官方、moonshot 官方、
// kimi 兼容端点等)都遵循 OpenAI 接口规范,差别只在完整 endpoint URL 和 APIKey。
type openaiAdapter struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewOpenAI 构造一个 OpenAI 兼容适配器。
func NewOpenAI(p Params) *openaiAdapter {
	timeout := time.Duration(p.TimeoutS) * time.Second
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &openaiAdapter{
		baseURL: p.BaseURL,
		apiKey:  p.APIKey,
		client:  &http.Client{Timeout: timeout},
	}
}

func (a *openaiAdapter) Type() string { return "openai" }

func (a *openaiAdapter) SupportsImageReferences() bool {
	return a.endpointKind() == openAIEndpointResponses
}

type openAIEndpointKind int

const (
	openAIEndpointUnknown openAIEndpointKind = iota
	openAIEndpointChatCompletions
	openAIEndpointImageGenerations
	openAIEndpointResponses
)

type openAIResponsesContent struct {
	Type    string `json:"type"`
	Text    string `json:"text"`
	Refusal string `json:"refusal"`
}

type openAIResponsesOutputItem struct {
	Type    string                   `json:"type"`
	Role    string                   `json:"role"`
	Content []openAIResponsesContent `json:"content"`
	Result  string                   `json:"result"`
	B64JSON string                   `json:"b64_json"`
}

type openAIResponsesUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
}

type openAIResponsesIncomplete struct {
	Reason string `json:"reason"`
}

type openAIResponsesObject struct {
	Status            string                      `json:"status"`
	OutputText        string                      `json:"output_text"`
	Output            []openAIResponsesOutputItem `json:"output"`
	Usage             openAIResponsesUsage        `json:"usage"`
	IncompleteDetails openAIResponsesIncomplete   `json:"incomplete_details"`
}

func (a *openaiAdapter) endpointKind() openAIEndpointKind {
	path := a.endpointPath()
	switch {
	case strings.HasSuffix(path, "/responses"):
		return openAIEndpointResponses
	case strings.HasSuffix(path, "/chat/completions"):
		return openAIEndpointChatCompletions
	case strings.HasSuffix(path, "/images/generations"), strings.HasSuffix(path, "/images/edits"):
		return openAIEndpointImageGenerations
	default:
		return openAIEndpointUnknown
	}
}

func (a *openaiAdapter) endpointPath() string {
	u, err := url.Parse(a.baseURL)
	if err == nil && u.Path != "" {
		return strings.ToLower(strings.TrimRight(u.Path, "/"))
	}
	return strings.ToLower(strings.TrimRight(a.baseURL, "/"))
}

// Chat 发起 OpenAI /v1/chat/completions 或 /v1/responses。流式和非流式都转成统一的 ChatStream。
func (a *openaiAdapter) Chat(ctx context.Context, upstreamModel string, req *ChatRequest) (ChatStream, error) {
	if a.endpointKind() == openAIEndpointResponses {
		return a.chatViaResponses(ctx, upstreamModel, req)
	}
	return a.chatViaChatCompletions(ctx, upstreamModel, req)
}

func (a *openaiAdapter) chatViaChatCompletions(ctx context.Context, upstreamModel string, req *ChatRequest) (ChatStream, error) {
	payload := map[string]any{
		"model":    upstreamModel,
		"messages": req.Messages,
		"stream":   req.Stream,
	}
	if req.Temperature > 0 {
		payload["temperature"] = req.Temperature
	}
	if req.TopP > 0 {
		payload["top_p"] = req.TopP
	}
	if req.MaxTokens > 0 {
		payload["max_tokens"] = req.MaxTokens
	}
	httpReq, err := a.newJSONRequest(ctx, a.baseURL, payload, req.Stream)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: request: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, upstreamErr(resp)
	}

	ch := make(chan ChatChunk, 16)
	if req.Stream {
		go parseOpenAISSE(resp.Body, ch)
	} else {
		go parseOpenAINonStream(resp.Body, ch)
	}
	return ch, nil
}

func (a *openaiAdapter) chatViaResponses(ctx context.Context, upstreamModel string, req *ChatRequest) (ChatStream, error) {
	payload := map[string]any{
		"model":  upstreamModel,
		"input":  openAIResponsesInputFromMessages(req.Messages),
		"stream": req.Stream,
	}
	if req.Temperature > 0 {
		payload["temperature"] = req.Temperature
	}
	if req.TopP > 0 {
		payload["top_p"] = req.TopP
	}
	if req.MaxTokens > 0 {
		payload["max_output_tokens"] = req.MaxTokens
	}
	httpReq, err := a.newJSONRequest(ctx, a.baseURL, payload, req.Stream)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: request: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, upstreamErr(resp)
	}

	ch := make(chan ChatChunk, 16)
	if req.Stream {
		go parseOpenAIResponsesTextSSE(resp.Body, ch)
	} else {
		go parseOpenAIResponsesNonStream(resp.Body, ch)
	}
	return ch, nil
}

// parseOpenAISSE 解析 text/event-stream 响应,每行 data: {...}。
func parseOpenAISSE(body io.ReadCloser, ch chan<- ChatChunk) {
	defer body.Close()
	defer close(ch)

	sc := bufio.NewScanner(body)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 4*1024*1024)

	var lastUsage *ChatUsage

	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var obj struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &obj); err != nil {
			continue
		}
		if obj.Usage != nil {
			lastUsage = &ChatUsage{
				PromptTokens:     obj.Usage.PromptTokens,
				CompletionTokens: obj.Usage.CompletionTokens,
				TotalTokens:      obj.Usage.TotalTokens,
			}
		}
		for _, c := range obj.Choices {
			chunk := ChatChunk{Delta: c.Delta.Content}
			if c.FinishReason != nil {
				chunk.FinishReason = *c.FinishReason
			}
			ch <- chunk
		}
	}

	if lastUsage != nil {
		ch <- ChatChunk{Usage: lastUsage}
	}
	if err := sc.Err(); err != nil && !errors.Is(err, io.EOF) {
		ch <- ChatChunk{Err: err}
	}
}

func parseOpenAIResponsesTextSSE(body io.ReadCloser, ch chan<- ChatChunk) {
	defer close(ch)

	finish := "stop"
	var usage *ChatUsage
	sawText := false

	err := scanSSE(body, func(event string, data []byte) bool {
		if strings.TrimSpace(string(data)) == "[DONE]" {
			return false
		}
		switch event {
		case "response.output_text.delta", "response.refusal.delta":
			var obj struct {
				Delta string `json:"delta"`
			}
			if err := json.Unmarshal(data, &obj); err == nil && obj.Delta != "" {
				sawText = true
				ch <- ChatChunk{Delta: obj.Delta}
			}
		case "response.completed":
			var obj struct {
				Response openAIResponsesObject `json:"response"`
			}
			if err := json.Unmarshal(data, &obj); err != nil {
				return true
			}
			if !sawText {
				if text := collectResponsesText(obj.Response); text != "" {
					sawText = true
					ch <- ChatChunk{Delta: text}
				}
			}
			usage = chatUsageFromResponses(obj.Response.Usage)
			finish = responsesFinishReason(obj.Response.Status, obj.Response.IncompleteDetails.Reason)
		}
		return true
	})
	if err != nil && !errors.Is(err, io.EOF) {
		ch <- ChatChunk{Err: err}
		return
	}
	ch <- ChatChunk{FinishReason: finish, Usage: usage}
}

// parseOpenAINonStream 读整个 JSON 响应,一次吐成 delta + finish_reason。
func parseOpenAINonStream(body io.ReadCloser, ch chan<- ChatChunk) {
	defer body.Close()
	defer close(ch)

	var obj struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(body).Decode(&obj); err != nil {
		ch <- ChatChunk{Err: fmt.Errorf("openai: decode non-stream: %w", err)}
		return
	}
	if len(obj.Choices) == 0 {
		ch <- ChatChunk{FinishReason: "stop"}
		return
	}
	c := obj.Choices[0]
	ch <- ChatChunk{Delta: c.Message.Content, FinishReason: c.FinishReason}
	ch <- ChatChunk{Usage: &ChatUsage{
		PromptTokens:     obj.Usage.PromptTokens,
		CompletionTokens: obj.Usage.CompletionTokens,
		TotalTokens:      obj.Usage.TotalTokens,
	}}
}

func parseOpenAIResponsesNonStream(body io.ReadCloser, ch chan<- ChatChunk) {
	defer body.Close()
	defer close(ch)

	var obj openAIResponsesObject
	if err := json.NewDecoder(body).Decode(&obj); err != nil {
		ch <- ChatChunk{Err: fmt.Errorf("openai: decode responses non-stream: %w", err)}
		return
	}
	text := collectResponsesText(obj)
	finish := responsesFinishReason(obj.Status, obj.IncompleteDetails.Reason)
	if text != "" || finish != "" {
		ch <- ChatChunk{Delta: text, FinishReason: finish}
	}
	if usage := chatUsageFromResponses(obj.Usage); usage != nil {
		ch <- ChatChunk{Usage: usage}
	}
}

// ImageGenerate 调用 /v1/images/generations 或 /v1/responses(image_generation tool)。
func (a *openaiAdapter) ImageGenerate(ctx context.Context, upstreamModel string, req *ImageRequest) (*ImageResult, error) {
	if a.endpointKind() == openAIEndpointResponses {
		return a.imageGenerateViaResponses(ctx, upstreamModel, req)
	}
	if len(req.References) > 0 {
		return nil, ErrImageReferencesUnsupported
	}
	return a.imageGenerateViaImagesEndpoint(ctx, upstreamModel, req)
}

func (a *openaiAdapter) imageGenerateViaImagesEndpoint(ctx context.Context, upstreamModel string, req *ImageRequest) (*ImageResult, error) {
	n := req.N
	if n <= 0 {
		n = 1
	}
	payload := map[string]any{
		"model":  upstreamModel,
		"prompt": req.Prompt,
		"n":      n,
	}
	if req.Size != "" {
		payload["size"] = req.Size
	}
	httpReq, err := a.newJSONRequest(ctx, a.baseURL, payload, false)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: image request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, upstreamErr(resp)
	}
	var obj struct {
		Data []struct {
			URL string `json:"url"`
			B64 string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&obj); err != nil {
		return nil, fmt.Errorf("openai: image decode: %w", err)
	}
	r := &ImageResult{}
	for _, d := range obj.Data {
		if d.URL != "" {
			r.URLs = append(r.URLs, d.URL)
		}
		if d.B64 != "" {
			r.B64s = append(r.B64s, d.B64)
		}
	}
	if len(r.URLs) == 0 && len(r.B64s) == 0 {
		return nil, errors.New("openai: empty image response")
	}
	return r, nil
}

func (a *openaiAdapter) imageGenerateViaResponses(ctx context.Context, upstreamModel string, req *ImageRequest) (*ImageResult, error) {
	n := req.N
	if n <= 0 {
		n = 1
	}
	out := &ImageResult{}
	for i := 0; i < n; i++ {
		one, err := a.imageGenerateViaResponsesOnce(ctx, upstreamModel, req)
		if err != nil {
			return nil, err
		}
		out.URLs = append(out.URLs, one.URLs...)
		out.B64s = append(out.B64s, one.B64s...)
	}
	if len(out.URLs) == 0 && len(out.B64s) == 0 {
		return nil, errors.New("openai: empty image response")
	}
	return out, nil
}

func (a *openaiAdapter) imageGenerateViaResponsesOnce(ctx context.Context, upstreamModel string, req *ImageRequest) (*ImageResult, error) {
	tool := map[string]any{
		"type":    "image_generation",
		"quality": "high",
	}
	if req.Size != "" {
		tool["size"] = req.Size
	}
	payload := map[string]any{
		"model":       upstreamModel,
		"stream":      true,
		"input":       openAIResponsesInputFromImageRequest(req),
		"tools":       []map[string]any{tool},
		"tool_choice": map[string]any{"type": "image_generation"},
	}
	httpReq, err := a.newJSONRequest(ctx, a.baseURL, payload, true)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: responses image request: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, upstreamErr(resp)
	}
	result, err := parseOpenAIResponsesImageSSE(resp.Body)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func parseOpenAIResponsesImageSSE(body io.ReadCloser) (*ImageResult, error) {
	var bestB64 string
	err := scanSSE(body, func(event string, data []byte) bool {
		if strings.TrimSpace(string(data)) == "[DONE]" {
			return false
		}
		switch event {
		case "response.image_generation_call.partial_image":
			var obj struct {
				PartialImageB64 string `json:"partial_image_b64"`
			}
			if err := json.Unmarshal(data, &obj); err == nil && obj.PartialImageB64 != "" {
				bestB64 = obj.PartialImageB64
			}
		case "response.output_item.done":
			var obj struct {
				Item openAIResponsesOutputItem `json:"item"`
			}
			if err := json.Unmarshal(data, &obj); err == nil {
				if b64 := imageB64FromOutputItem(obj.Item); b64 != "" {
					bestB64 = b64
				}
			}
		case "response.completed":
			var obj struct {
				Response openAIResponsesObject `json:"response"`
			}
			if err := json.Unmarshal(data, &obj); err == nil {
				if b64 := firstResponsesImage(obj.Response.Output); b64 != "" {
					bestB64 = b64
				}
			}
		}
		return true
	})
	if err != nil && !errors.Is(err, io.EOF) {
		if bestB64 != "" && isSSEReadTimeout(err) {
			return &ImageResult{B64s: []string{bestB64}}, nil
		}
		return nil, err
	}
	if bestB64 == "" {
		return nil, errors.New("openai: empty image response")
	}
	return &ImageResult{B64s: []string{bestB64}}, nil
}

func isSSEReadTimeout(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	var timeoutErr interface{ Timeout() bool }
	return errors.As(err, &timeoutErr) && timeoutErr.Timeout()
}

// Ping 对已配置的完整 endpoint 发一次轻量探活请求。
// /v1/responses 兼容站普遍要求 POST,其余 endpoint 继续走 HEAD。
func (a *openaiAdapter) Ping(ctx context.Context) error {
	if a.endpointKind() == openAIEndpointResponses {
		return a.pingResponses(ctx)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodHead, a.baseURL, nil)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.apiKey)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusMethodNotAllowed {
		return nil
	}
	if resp.StatusCode >= 400 {
		return upstreamErr(resp)
	}
	return nil
}

func (a *openaiAdapter) pingResponses(ctx context.Context) error {
	payload := map[string]any{
		"model":             "gpt-5.4",
		"input":             "ping",
		"max_output_tokens": 1,
	}
	httpReq, err := a.newJSONRequest(ctx, a.baseURL, payload, false)
	if err != nil {
		return err
	}
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated, http.StatusAccepted, http.StatusNoContent,
		http.StatusBadRequest, http.StatusUnprocessableEntity:
		return nil
	}
	if resp.StatusCode >= 400 {
		return upstreamErr(resp)
	}
	return nil
}

func (a *openaiAdapter) newJSONRequest(ctx context.Context, targetURL string, payload any, acceptSSE bool) (*http.Request, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.apiKey)
	if acceptSSE {
		httpReq.Header.Set("Accept", "text/event-stream")
	}
	return httpReq, nil
}

func openAIResponsesInputFromPrompt(prompt string) []map[string]any {
	return openAIResponsesInputFromImageRequest(&ImageRequest{Prompt: prompt})
}

func openAIResponsesInputFromImageRequest(req *ImageRequest) []map[string]any {
	content := []map[string]any{{
		"type": "input_text",
		"text": req.Prompt,
	}}
	for _, ref := range req.References {
		u := strings.TrimSpace(ref.URL)
		if u == "" {
			continue
		}
		content = append(content, map[string]any{
			"type":      "input_image",
			"image_url": u,
		})
	}
	return []map[string]any{{
		"role":    "user",
		"content": content,
	}}
}

func openAIResponsesInputFromMessages(messages []chatgpt.ChatMessage) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		out = append(out, map[string]any{
			"role": normalizeResponsesRole(msg.Role),
			"content": []map[string]any{{
				"type": "input_text",
				"text": msg.Content,
			}},
		})
	}
	return out
}

func normalizeResponsesRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant", "system", "developer", "tool", "user":
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return "user"
	}
}

func scanSSE(body io.ReadCloser, handle func(event string, data []byte) bool) error {
	defer body.Close()

	rd := bufio.NewReaderSize(body, 32*1024)
	var event string
	var dataBuf strings.Builder

	flush := func() bool {
		if dataBuf.Len() == 0 {
			event = ""
			return true
		}
		data := strings.TrimRight(dataBuf.String(), "\n")
		dataBuf.Reset()
		keepGoing := handle(event, []byte(data))
		event = ""
		return keepGoing
	}

	for {
		line, err := rd.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				flush()
				return nil
			}
			return err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if !flush() {
				return nil
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if strings.HasPrefix(line, "data:") {
			part := strings.TrimPrefix(line, "data:")
			if len(part) > 0 && part[0] == ' ' {
				part = part[1:]
			}
			if dataBuf.Len() > 0 {
				dataBuf.WriteByte('\n')
			}
			dataBuf.WriteString(part)
		}
	}
}

func collectResponsesText(obj openAIResponsesObject) string {
	if obj.OutputText != "" {
		return obj.OutputText
	}
	var b strings.Builder
	for _, item := range obj.Output {
		if item.Type != "message" {
			continue
		}
		for _, content := range item.Content {
			switch content.Type {
			case "output_text":
				b.WriteString(content.Text)
			case "refusal":
				b.WriteString(content.Refusal)
			}
		}
	}
	return b.String()
}

func chatUsageFromResponses(usage openAIResponsesUsage) *ChatUsage {
	if usage.InputTokens == 0 && usage.OutputTokens == 0 && usage.TotalTokens == 0 {
		return nil
	}
	return &ChatUsage{
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.TotalTokens,
	}
}

func responsesFinishReason(status string, incompleteReason string) string {
	reason := strings.ToLower(strings.TrimSpace(incompleteReason))
	switch reason {
	case "max_output_tokens", "max_tokens":
		return "length"
	}
	if strings.ToLower(strings.TrimSpace(status)) == "incomplete" && reason == "content_filter" {
		return "content_filter"
	}
	return "stop"
}

func imageB64FromOutputItem(item openAIResponsesOutputItem) string {
	if item.Type != "image_generation_call" {
		return ""
	}
	if item.Result != "" {
		return item.Result
	}
	return item.B64JSON
}

func firstResponsesImage(items []openAIResponsesOutputItem) string {
	for _, item := range items {
		if b64 := imageB64FromOutputItem(item); b64 != "" {
			return b64
		}
	}
	return ""
}

// upstreamErr 读取响应 body 做简要错误归纳。
func upstreamErr(resp *http.Response) error {
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
	return fmt.Errorf("upstream %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
}
