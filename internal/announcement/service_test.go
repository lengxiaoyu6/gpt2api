package announcement

import (
	"context"
	"errors"
	"sort"
	"testing"
	"time"
)

type fakeStore struct {
	items  map[uint64]*Announcement
	nextID uint64
}

func newFakeStore() *fakeStore {
	return &fakeStore{items: map[uint64]*Announcement{}, nextID: 1}
}

func (s *fakeStore) List(ctx context.Context, enabledOnly bool) ([]Announcement, error) {
	rows := make([]Announcement, 0, len(s.items))
	for _, item := range s.items {
		if enabledOnly && !item.Enabled {
			continue
		}
		rows = append(rows, *item)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SortOrder == rows[j].SortOrder {
			return rows[i].ID > rows[j].ID
		}
		return rows[i].SortOrder > rows[j].SortOrder
	})
	return rows, nil
}

func (s *fakeStore) Create(ctx context.Context, input Announcement) (*Announcement, error) {
	input.ID = s.nextID
	s.nextID++
	s.items[input.ID] = &input
	return &input, nil
}

func (s *fakeStore) Update(ctx context.Context, id uint64, input Announcement) (*Announcement, error) {
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

func TestServiceListPublicOnlyEnabledAndSorted(t *testing.T) {
	store := newFakeStore()
	base := time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC)
	store.items[1] = &Announcement{ID: 1, Title: "低", Content: "A", Enabled: true, SortOrder: 1, CreatedAt: base, UpdatedAt: base}
	store.items[2] = &Announcement{ID: 2, Title: "停用", Content: "B", Enabled: false, SortOrder: 99, CreatedAt: base, UpdatedAt: base}
	store.items[3] = &Announcement{ID: 3, Title: "高", Content: "C", Enabled: true, SortOrder: 10, CreatedAt: base, UpdatedAt: base}
	svc := NewService(store)

	rows, err := svc.ListPublic(context.Background())
	if err != nil {
		t.Fatalf("ListPublic: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("len(rows) = %d, want 2", len(rows))
	}
	if rows[0].ID != 3 || rows[1].ID != 1 {
		t.Fatalf("unexpected order: %#v", rows)
	}
}

func TestServiceCreateTrimsInputAndSetsTime(t *testing.T) {
	store := newFakeStore()
	base := time.Date(2026, 4, 26, 11, 0, 0, 0, time.UTC)
	svc := NewService(store)
	svc.now = func() time.Time { return base }

	created, err := svc.Create(context.Background(), SaveInput{
		Title: "  维护公告  ", Content: "  今晚维护  ", Enabled: true, SortOrder: 5,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Title != "维护公告" || created.Content != "今晚维护" {
		t.Fatalf("unexpected normalized input: %#v", created)
	}
	if !created.CreatedAt.Equal(base) || !created.UpdatedAt.Equal(base) {
		t.Fatalf("unexpected time: %#v", created)
	}
}

func TestServiceValidateInput(t *testing.T) {
	svc := NewService(newFakeStore())

	_, err := svc.Create(context.Background(), SaveInput{Title: "", Content: "content", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("title err = %v, want ErrInvalidInput", err)
	}

	_, err = svc.Create(context.Background(), SaveInput{Title: "title", Content: "", Enabled: true})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("content err = %v, want ErrInvalidInput", err)
	}
}
