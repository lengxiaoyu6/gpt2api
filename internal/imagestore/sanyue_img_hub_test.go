package imagestore

import (
	"bytes"
	"context"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSanyueImgHubUploadUsesExpectedRequestShape(t *testing.T) {
	var gotMethod string
	var gotAuthCode string
	var gotServerCompress string
	var gotReturnFormat string
	var gotUploadChannel string
	var gotFieldName string
	var gotPartContentType string
	var gotFileSize int

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotAuthCode = r.URL.Query().Get("authCode")
		gotServerCompress = r.URL.Query().Get("serverCompress")
		gotReturnFormat = r.URL.Query().Get("returnFormat")
		gotUploadChannel = r.URL.Query().Get("uploadChannel")
		mr, err := r.MultipartReader()
		if err != nil {
			t.Fatalf("MultipartReader: %v", err)
		}
		part, err := mr.NextPart()
		if err != nil {
			t.Fatalf("NextPart: %v", err)
		}
		gotFieldName = part.FormName()
		gotPartContentType = part.Header.Get("Content-Type")
		body, err := io.ReadAll(part)
		if err != nil {
			t.Fatalf("ReadAll: %v", err)
		}
		gotFileSize = len(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"src":"https://cdn.example.com/a.png"}]`))
	}))
	defer ts.Close()

	uploader := NewSanyueImgHubUploader(SanyueImgHubUploaderOptions{
		UploadURL:      ts.URL,
		AuthCode:       "auth-123",
		ServerCompress: true,
		ReturnFormat:   "full",
	})

	url, err := uploader.Upload(context.Background(), SourceImage{Index: 0, Data: []byte("png-bytes"), ContentType: "image/png"})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if url != "https://cdn.example.com/a.png" {
		t.Fatalf("url = %q", url)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method = %q", gotMethod)
	}
	if gotAuthCode != "auth-123" || gotServerCompress != "true" || gotReturnFormat != "full" || gotUploadChannel != "telegram" {
		t.Fatalf("unexpected query: authCode=%q serverCompress=%q returnFormat=%q uploadChannel=%q", gotAuthCode, gotServerCompress, gotReturnFormat, gotUploadChannel)
	}
	if gotFieldName != "file" {
		t.Fatalf("field name = %q", gotFieldName)
	}
	if gotPartContentType != "image/png" {
		t.Fatalf("part content type = %q", gotPartContentType)
	}
	if gotFileSize != len("png-bytes") {
		t.Fatalf("file size = %d", gotFileSize)
	}
}

func TestSanyueImgHubUploadReturnsErrorsForBadResponses(t *testing.T) {
	cases := []struct {
		name       string
		statusCode int
		body       string
		wantErr    string
	}{
		{name: "empty array", statusCode: http.StatusOK, body: `[]`, wantErr: "empty"},
		{name: "missing src", statusCode: http.StatusOK, body: `[{"url":"https://cdn.example.com/a.png"}]`, wantErr: "src"},
		{name: "http error", statusCode: http.StatusBadGateway, body: `{"error":"bad gateway"}`, wantErr: "502"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.statusCode)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer ts.Close()

			uploader := NewSanyueImgHubUploader(SanyueImgHubUploaderOptions{
				UploadURL:      ts.URL,
				AuthCode:       "auth",
				ServerCompress: false,
				ReturnFormat:   "full",
			})
			_, err := uploader.Upload(context.Background(), SourceImage{Index: 0, Data: []byte("bytes"), ContentType: "image/png"})
			if err == nil {
				t.Fatal("expected error")
			}
			if !bytes.Contains([]byte(err.Error()), []byte(tc.wantErr)) {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestSanyueImgHubUploadBuildsMultipartFileField(t *testing.T) {
	var gotFileName string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType := r.Header.Get("Content-Type")
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			t.Fatalf("ParseMediaType: %v", err)
		}
		boundary := params["boundary"]
		if boundary == "" {
			t.Fatal("missing boundary")
		}
		mr := multipart.NewReader(r.Body, boundary)
		part, err := mr.NextPart()
		if err != nil {
			t.Fatalf("NextPart: %v", err)
		}
		if part.FormName() != "file" {
			t.Fatalf("field name = %q", part.FormName())
		}
		gotFileName = part.FileName()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"src":"https://cdn.example.com/b.png"}]`))
	}))
	defer ts.Close()

	uploader := NewSanyueImgHubUploader(SanyueImgHubUploaderOptions{UploadURL: ts.URL, AuthCode: "a", ReturnFormat: "full"})
	if _, err := uploader.Upload(context.Background(), SourceImage{Index: 1, FileName: "img_task_1", Data: []byte("hello"), ContentType: "image/png"}); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if gotFileName != "img_task_1.png" {
		t.Fatalf("file name = %q", gotFileName)
	}
}
