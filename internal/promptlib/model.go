package promptlib

import (
	"errors"
	"time"
)

var (
	ErrInvalidInput = errors.New("prompt library: invalid input")
	ErrNotFound     = errors.New("prompt library: not found")
)

// PromptLibraryItem 是后台维护并提供给用户端选择的生图 Prompt。
type PromptLibraryItem struct {
	ID              uint64    `db:"id" json:"id"`
	Title           string    `db:"title" json:"title"`
	Content         string    `db:"content" json:"content"`
	Category        string    `db:"category" json:"category"`
	PreviewImageURL string    `db:"preview_image_url" json:"preview_image_url"`
	Tags            []string  `json:"tags"`
	Enabled         bool      `db:"enabled" json:"enabled"`
	SortOrder       int       `db:"sort_order" json:"sort_order"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at" json:"updated_at"`
}

type PromptCategory struct {
	ID        uint64    `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// SaveInput 是创建与修改 Prompt 时的输入。
type SaveInput struct {
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Category        string   `json:"category"`
	PreviewImageURL string   `json:"preview_image_url"`
	Tags            []string `json:"tags"`
	Enabled         bool     `json:"enabled"`
	SortOrder       int      `json:"sort_order"`
}

type SaveCategoryInput struct {
	Name string `json:"name"`
}

// ListInput 是列表接口接收的筛选与分页参数。
type ListInput struct {
	Keyword  string
	Category string
	Enabled  *bool
	Limit    int
	Offset   int
}

// ListParams 是持久层实际使用的筛选与分页参数。
type ListParams struct {
	Keyword     string
	Category    string
	Enabled     *bool
	EnabledOnly bool
	Limit       int
	Offset      int
}

// ListOutput 是列表接口返回值。
type ListOutput struct {
	Items  []PromptLibraryItem `json:"items"`
	Total  int                 `json:"total"`
	Limit  int                 `json:"limit"`
	Offset int                 `json:"offset"`
}

// CategoriesOutput 是分类列表接口返回值。
type CategoriesOutput struct {
	Items []string `json:"items"`
}

type AdminCategoriesOutput struct {
	Items []PromptCategory `json:"items"`
}
