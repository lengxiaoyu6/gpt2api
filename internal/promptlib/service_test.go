package promptlib

import (
	"context"
	"errors"
	"sort"
	"strings"
	"testing"
	"time"
)

type fakePromptStore struct {
	items  map[uint64]*PromptLibraryItem
	nextID uint64
}

func newFakePromptStore() *fakePromptStore {
	return &fakePromptStore{items: map[uint64]*PromptLibraryItem{}, nextID: 1}
}

func (s *fakePromptStore) List(ctx context.Context, params ListParams) ([]PromptLibraryItem, int, error) {
	rows := make([]PromptLibraryItem, 0, len(s.items))
	for _, item := range s.items {
		if params.EnabledOnly && !item.Enabled {
			continue
		}
		if params.Enabled != nil && item.Enabled != *params.Enabled {
			continue
		}
		if params.Category != "" && item.Category != params.Category {
			continue
		}
		if params.Keyword != "" {
			needle := strings.ToLower(params.Keyword)
			haystack := strings.ToLower(item.Title + "\n" + item.Content + "\n" + strings.Join(item.Tags, "\n"))
			if !strings.Contains(haystack, needle) {
				continue
			}
		}
		rows = append(rows, *item)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SortOrder == rows[j].SortOrder {
			return rows[i].ID > rows[j].ID
		}
		return rows[i].SortOrder > rows[j].SortOrder
	})
	total := len(rows)
	start := params.Offset
	if start > len(rows) {
		start = len(rows)
	}
	end := start + params.Limit
	if end > len(rows) {
		end = len(rows)
	}
	return rows[start:end], total, nil
}

func (s *fakePromptStore) Categories(ctx context.Context) ([]string, error) {
	seen := map[string]struct{}{}
	rows := []string{}
	for _, item := range s.items {
		if !item.Enabled {
			continue
		}
		if _, ok := seen[item.Category]; ok {
			continue
		}
		seen[item.Category] = struct{}{}
		rows = append(rows, item.Category)
	}
	sort.Strings(rows)
	return rows, nil
}

func (s *fakePromptStore) Create(ctx context.Context, input PromptLibraryItem) (*PromptLibraryItem, error) {
	input.ID = s.nextID
	s.nextID++
	s.items[input.ID] = &input
	return &input, nil
}

func (s *fakePromptStore) Update(ctx context.Context, id uint64, input PromptLibraryItem) (*PromptLibraryItem, error) {
	current, ok := s.items[id]
	if !ok {
		return nil, ErrNotFound
	}
	input.ID = id
	input.CreatedAt = current.CreatedAt
	s.items[id] = &input
	return &input, nil
}

func (s *fakePromptStore) Delete(ctx context.Context, id uint64) error {
	if _, ok := s.items[id]; !ok {
		return ErrNotFound
	}
	delete(s.items, id)
	return nil
}

func TestServiceListMeOnlyEnabledSearchCategoryAndPaging(t *testing.T) {
	store := newFakePromptStore()
	base := time.Date(2026, 4, 29, 9, 0, 0, 0, time.UTC)
	store.items[1] = &PromptLibraryItem{ID: 1, Title: "城市夜景", Content: "赛博朋克街道", Category: "摄影", Tags: []string{"城市"}, Enabled: true, SortOrder: 1, CreatedAt: base, UpdatedAt: base}
	store.items[2] = &PromptLibraryItem{ID: 2, Title: "森林精灵", Content: "绿色林地", Category: "插画", Tags: []string{"自然"}, Enabled: true, SortOrder: 10, CreatedAt: base, UpdatedAt: base}
	store.items[3] = &PromptLibraryItem{ID: 3, Title: "停用城市", Content: "城市", Category: "摄影", Tags: []string{"停用"}, Enabled: false, SortOrder: 99, CreatedAt: base, UpdatedAt: base}
	store.items[4] = &PromptLibraryItem{ID: 4, Title: "城市航拍", Content: "雨夜高楼", Category: "摄影", Tags: []string{"航拍"}, Enabled: true, SortOrder: 20, CreatedAt: base, UpdatedAt: base}
	svc := NewService(store)

	out, err := svc.ListMe(context.Background(), ListInput{Keyword: "城市", Category: "摄影", Limit: 1, Offset: 0})
	if err != nil {
		t.Fatalf("ListMe: %v", err)
	}
	if out.Total != 2 || out.Limit != 1 || out.Offset != 0 {
		t.Fatalf("unexpected page metadata: %#v", out)
	}
	if len(out.Items) != 1 || out.Items[0].ID != 4 {
		t.Fatalf("unexpected items: %#v", out.Items)
	}
}

func TestServiceCreateNormalizesInputAndTags(t *testing.T) {
	store := newFakePromptStore()
	base := time.Date(2026, 4, 29, 10, 0, 0, 0, time.UTC)
	svc := NewService(store)
	svc.now = func() time.Time { return base }

	created, err := svc.Create(context.Background(), SaveInput{
		Title:           "  电影感人像  ",
		Content:         "  高细节，柔和侧光  ",
		Category:        "  ",
		PreviewImageURL: "  https://cdn.example.test/prompts/portrait.webp  ",
		Tags:            []string{" 人像 ", "电影感", "人像", "", "光影", "色彩", "胶片", "景深", "构图", "质感", "超出数量"},
		Enabled:         true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Title != "电影感人像" || created.Content != "高细节，柔和侧光" {
		t.Fatalf("unexpected normalized input: %#v", created)
	}
	if created.Category != "通用" {
		t.Fatalf("category = %q, want 通用", created.Category)
	}
	if created.PreviewImageURL != "https://cdn.example.test/prompts/portrait.webp" {
		t.Fatalf("preview_image_url = %q", created.PreviewImageURL)
	}
	if got := strings.Join(created.Tags, ","); got != "人像,电影感,光影,色彩,胶片,景深,构图,质感,超出数量" {
		t.Fatalf("unexpected tags: %q", got)
	}
	if !created.CreatedAt.Equal(base) || !created.UpdatedAt.Equal(base) {
		t.Fatalf("unexpected time: %#v", created)
	}
}

func TestServiceValidateInputPagingAndNotFound(t *testing.T) {
	svc := NewService(newFakePromptStore())

	_, err := svc.Create(context.Background(), SaveInput{Title: "", Content: "content", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("title err = %v, want ErrInvalidInput", err)
	}

	_, err = svc.Create(context.Background(), SaveInput{Title: "title", Content: "", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("content err = %v, want ErrInvalidInput", err)
	}

	_, err = svc.Create(context.Background(), SaveInput{Title: "title", Content: "content", PreviewImageURL: "ftp://example.test/a.webp", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("preview image url err = %v, want ErrInvalidInput", err)
	}

	if err := svc.Delete(context.Background(), 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete err = %v, want ErrNotFound", err)
	}

	params := normalizeListInput(ListInput{Limit: 1000, Offset: -10}, true)
	if params.Limit != 100 || params.Offset != 0 || !params.EnabledOnly {
		t.Fatalf("unexpected normalized paging: %#v", params)
	}
}
