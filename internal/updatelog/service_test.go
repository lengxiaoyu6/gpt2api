package updatelog

import (
	"context"
	"errors"
	"sort"
	"testing"
	"time"
)

type fakeStore struct {
	items  map[uint64]*UpdateLog
	nextID uint64
}

func newFakeStore() *fakeStore {
	return &fakeStore{items: map[uint64]*UpdateLog{}, nextID: 1}
}

func (s *fakeStore) List(ctx context.Context, params ListParams) ([]UpdateLog, int, error) {
	rows := make([]UpdateLog, 0, len(s.items))
	for _, item := range s.items {
		if params.EnabledOnly && !item.Enabled {
			continue
		}
		rows = append(rows, *item)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SortOrder == rows[j].SortOrder {
			ti := rows[i].DisplayTime()
			tj := rows[j].DisplayTime()
			if ti.Equal(tj) {
				return rows[i].ID > rows[j].ID
			}
			return ti.After(tj)
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

func (s *fakeStore) Create(ctx context.Context, input UpdateLog) (*UpdateLog, error) {
	input.ID = s.nextID
	s.nextID++
	s.items[input.ID] = &input
	return &input, nil
}

func (s *fakeStore) Update(ctx context.Context, id uint64, input UpdateLog) (*UpdateLog, error) {
	current, ok := s.items[id]
	if !ok {
		return nil, ErrNotFound
	}
	input.ID = id
	input.CreatedAt = current.CreatedAt
	s.items[id] = &input
	return &input, nil
}

func (s *fakeStore) Delete(ctx context.Context, id uint64) error {
	if _, ok := s.items[id]; !ok {
		return ErrNotFound
	}
	delete(s.items, id)
	return nil
}

func TestServiceListPublicOnlyEnabledSortedAndPaged(t *testing.T) {
	store := newFakeStore()
	base := time.Date(2026, 4, 29, 8, 0, 0, 0, time.UTC)
	older := base.Add(-2 * time.Hour)
	newer := base.Add(2 * time.Hour)
	store.items[1] = &UpdateLog{ID: 1, Version: "v1.0.0", Title: "低", Content: "A", Enabled: true, SortOrder: 1, PublishedAt: &newer, CreatedAt: base, UpdatedAt: base}
	store.items[2] = &UpdateLog{ID: 2, Version: "v1.0.1", Title: "停用", Content: "B", Enabled: false, SortOrder: 99, PublishedAt: &newer, CreatedAt: base, UpdatedAt: base}
	store.items[3] = &UpdateLog{ID: 3, Version: "v1.0.2", Title: "高旧", Content: "C", Enabled: true, SortOrder: 10, PublishedAt: &older, CreatedAt: base, UpdatedAt: base}
	store.items[4] = &UpdateLog{ID: 4, Version: "v1.0.3", Title: "高新", Content: "D", Enabled: true, SortOrder: 10, PublishedAt: &newer, CreatedAt: base, UpdatedAt: base}
	svc := NewService(store)

	out, err := svc.ListPublic(context.Background(), ListInput{Limit: 2, Offset: 0})
	if err != nil {
		t.Fatalf("ListPublic: %v", err)
	}
	if out.Total != 3 || out.Limit != 2 || out.Offset != 0 {
		t.Fatalf("unexpected page metadata: %#v", out)
	}
	if len(out.Items) != 2 {
		t.Fatalf("len(out.Items) = %d, want 2", len(out.Items))
	}
	if out.Items[0].ID != 4 || out.Items[1].ID != 3 {
		t.Fatalf("unexpected order: %#v", out.Items)
	}
}

func TestServiceCreateTrimsInputAndSetsTime(t *testing.T) {
	store := newFakeStore()
	base := time.Date(2026, 4, 29, 9, 0, 0, 0, time.UTC)
	published := base.Add(-time.Hour)
	svc := NewService(store)
	svc.now = func() time.Time { return base }

	created, err := svc.Create(context.Background(), SaveInput{
		Version: "  v1.2.0  ", Title: "  新增功能  ", Content: "  更新内容  ", Enabled: true, SortOrder: 5, PublishedAt: &published,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Version != "v1.2.0" || created.Title != "新增功能" || created.Content != "更新内容" {
		t.Fatalf("unexpected normalized input: %#v", created)
	}
	if !created.CreatedAt.Equal(base) || !created.UpdatedAt.Equal(base) {
		t.Fatalf("unexpected time: %#v", created)
	}
	if created.PublishedAt == nil || !created.PublishedAt.Equal(published) {
		t.Fatalf("unexpected published_at: %#v", created.PublishedAt)
	}
}

func TestServiceValidateInputAndPaging(t *testing.T) {
	svc := NewService(newFakeStore())

	_, err := svc.Create(context.Background(), SaveInput{Title: "", Content: "content", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("title err = %v, want ErrInvalidInput", err)
	}

	_, err = svc.Create(context.Background(), SaveInput{Title: "title", Content: "", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("content err = %v, want ErrInvalidInput", err)
	}

	params := normalizeListInput(ListInput{Limit: 1000, Offset: -10}, true)
	if params.Limit != 100 || params.Offset != 0 || !params.EnabledOnly {
		t.Fatalf("unexpected normalized paging: %#v", params)
	}
}
