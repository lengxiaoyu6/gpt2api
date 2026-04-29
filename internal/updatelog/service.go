package updatelog

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// Store 抽象更新日志持久化能力，便于服务层测试。
type Store interface {
	List(ctx context.Context, params ListParams) ([]UpdateLog, int, error)
	Create(ctx context.Context, input UpdateLog) (*UpdateLog, error)
	Update(ctx context.Context, id uint64, input UpdateLog) (*UpdateLog, error)
	Delete(ctx context.Context, id uint64) error
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, now: time.Now}
}

func (s *Service) ListAdmin(ctx context.Context, input ListInput) (*ListOutput, error) {
	return s.list(ctx, input, false)
}

func (s *Service) ListPublic(ctx context.Context, input ListInput) (*ListOutput, error) {
	return s.list(ctx, input, true)
}

func (s *Service) list(ctx context.Context, input ListInput, enabledOnly bool) (*ListOutput, error) {
	params := normalizeListInput(input, enabledOnly)
	rows, total, err := s.store.List(ctx, params)
	if err != nil {
		return nil, err
	}
	return &ListOutput{Items: rows, Total: total, Limit: params.Limit, Offset: params.Offset}, nil
}

func (s *Service) Create(ctx context.Context, input SaveInput) (*UpdateLog, error) {
	item, err := normalizeInput(input)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	item.CreatedAt = now
	item.UpdatedAt = now
	return s.store.Create(ctx, item)
}

func (s *Service) Update(ctx context.Context, id uint64, input SaveInput) (*UpdateLog, error) {
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

func normalizeInput(input SaveInput) (UpdateLog, error) {
	version := strings.TrimSpace(input.Version)
	title := strings.TrimSpace(input.Title)
	content := strings.TrimSpace(input.Content)
	if utf8.RuneCountInString(version) > 64 {
		return UpdateLog{}, ErrInvalidInput
	}
	if utf8.RuneCountInString(title) == 0 || utf8.RuneCountInString(title) > 160 {
		return UpdateLog{}, ErrInvalidInput
	}
	if utf8.RuneCountInString(content) == 0 || utf8.RuneCountInString(content) > 10000 {
		return UpdateLog{}, ErrInvalidInput
	}
	var publishedAt *time.Time
	if input.PublishedAt != nil && !input.PublishedAt.IsZero() {
		published := input.PublishedAt.UTC()
		publishedAt = &published
	}
	return UpdateLog{
		Version:     version,
		Title:       title,
		Content:     content,
		Enabled:     input.Enabled,
		SortOrder:   input.SortOrder,
		PublishedAt: publishedAt,
	}, nil
}

func normalizeListInput(input ListInput, enabledOnly bool) ListParams {
	limit := input.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}
	offset := input.Offset
	if offset < 0 {
		offset = 0
	}
	return ListParams{EnabledOnly: enabledOnly, Limit: limit, Offset: offset}
}
