package announcement

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"
)

// Store 抽象公告持久化能力，便于服务层测试。
type Store interface {
	List(ctx context.Context, enabledOnly bool) ([]Announcement, error)
	Create(ctx context.Context, input Announcement) (*Announcement, error)
	Update(ctx context.Context, id uint64, input Announcement) (*Announcement, error)
	Delete(ctx context.Context, id uint64) error
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, now: time.Now}
}

func (s *Service) ListAdmin(ctx context.Context) ([]Announcement, error) {
	return s.store.List(ctx, false)
}

func (s *Service) ListPublic(ctx context.Context) ([]Announcement, error) {
	return s.store.List(ctx, true)
}

func (s *Service) Create(ctx context.Context, input SaveInput) (*Announcement, error) {
	item, err := normalizeInput(input)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	item.CreatedAt = now
	item.UpdatedAt = now
	return s.store.Create(ctx, item)
}

func (s *Service) Update(ctx context.Context, id uint64, input SaveInput) (*Announcement, error) {
	if id == 0 {
		return nil, ErrNotFound
	}
	item, err := normalizeInput(input)
	if err != nil {
		return nil, err
	}
	item.UpdatedAt = s.now().UTC()
	return s.store.Update(ctx, id, item)
}

func (s *Service) Delete(ctx context.Context, id uint64) error {
	if id == 0 {
		return ErrNotFound
	}
	return s.store.Delete(ctx, id)
}

func normalizeInput(input SaveInput) (Announcement, error) {
	title := strings.TrimSpace(input.Title)
	content := strings.TrimSpace(input.Content)
	if utf8.RuneCountInString(title) == 0 || utf8.RuneCountInString(title) > 120 {
		return Announcement{}, ErrInvalidInput
	}
	if utf8.RuneCountInString(content) == 0 || utf8.RuneCountInString(content) > 5000 {
		return Announcement{}, ErrInvalidInput
	}
	return Announcement{
		Title:     title,
		Content:   content,
		Enabled:   input.Enabled,
		SortOrder: input.SortOrder,
	}, nil
}
