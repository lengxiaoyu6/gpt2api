package promptlib

import (
	"context"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
	defaultCategory  = "通用"
)

// Store 抽象 Prompt 库持久化能力，便于服务层测试。
type Store interface {
	List(ctx context.Context, params ListParams) ([]PromptLibraryItem, int, error)
	Categories(ctx context.Context) ([]string, error)
	Create(ctx context.Context, input PromptLibraryItem) (*PromptLibraryItem, error)
	Update(ctx context.Context, id uint64, input PromptLibraryItem) (*PromptLibraryItem, error)
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

func (s *Service) ListMe(ctx context.Context, input ListInput) (*ListOutput, error) {
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

func (s *Service) Categories(ctx context.Context) (*CategoriesOutput, error) {
	rows, err := s.store.Categories(ctx)
	if err != nil {
		return nil, err
	}
	return &CategoriesOutput{Items: rows}, nil
}

func (s *Service) Create(ctx context.Context, input SaveInput) (*PromptLibraryItem, error) {
	item, err := normalizeInput(input)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	item.CreatedAt = now
	item.UpdatedAt = now
	return s.store.Create(ctx, item)
}

func (s *Service) Update(ctx context.Context, id uint64, input SaveInput) (*PromptLibraryItem, error) {
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

func normalizeInput(input SaveInput) (PromptLibraryItem, error) {
	title := strings.TrimSpace(input.Title)
	content := strings.TrimSpace(input.Content)
	category := strings.TrimSpace(input.Category)
	previewImageURL := strings.TrimSpace(input.PreviewImageURL)
	if category == "" {
		category = defaultCategory
	}
	if utf8.RuneCountInString(title) == 0 || utf8.RuneCountInString(title) > 160 {
		return PromptLibraryItem{}, ErrInvalidInput
	}
	if utf8.RuneCountInString(content) == 0 || utf8.RuneCountInString(content) > 10000 {
		return PromptLibraryItem{}, ErrInvalidInput
	}
	if utf8.RuneCountInString(category) == 0 || utf8.RuneCountInString(category) > 80 {
		return PromptLibraryItem{}, ErrInvalidInput
	}
	if !validPreviewImageURL(previewImageURL) {
		return PromptLibraryItem{}, ErrInvalidInput
	}
	return PromptLibraryItem{
		Title:           title,
		Content:         content,
		Category:        category,
		PreviewImageURL: previewImageURL,
		Tags:            normalizeTags(input.Tags),
		Enabled:         input.Enabled,
		SortOrder:       input.SortOrder,
	}, nil
}

func validPreviewImageURL(value string) bool {
	if value == "" {
		return true
	}
	if utf8.RuneCountInString(value) > 2048 {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || u.Host == "" {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

func normalizeTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := map[string]struct{}{}
	for _, tag := range tags {
		value := strings.TrimSpace(tag)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
		if len(out) >= 10 {
			break
		}
	}
	return out
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
	return ListParams{
		Keyword:     strings.TrimSpace(input.Keyword),
		Category:    strings.TrimSpace(input.Category),
		Enabled:     input.Enabled,
		EnabledOnly: enabledOnly,
		Limit:       limit,
		Offset:      offset,
	}
}
