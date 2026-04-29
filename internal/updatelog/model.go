package updatelog

import (
	"errors"
	"time"
)

var (
	ErrInvalidInput = errors.New("update log: invalid input")
	ErrNotFound     = errors.New("update log: not found")
)

// UpdateLog 是后台维护并在用户端公开展示的系统更新日志。
type UpdateLog struct {
	ID          uint64     `db:"id" json:"id"`
	Version     string     `db:"version" json:"version"`
	Title       string     `db:"title" json:"title"`
	Content     string     `db:"content" json:"content"`
	Enabled     bool       `db:"enabled" json:"enabled"`
	SortOrder   int        `db:"sort_order" json:"sort_order"`
	PublishedAt *time.Time `db:"published_at" json:"published_at"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
}

// DisplayTime 返回前台展示与排序使用的时间。
func (l UpdateLog) DisplayTime() time.Time {
	if l.PublishedAt != nil && !l.PublishedAt.IsZero() {
		return l.PublishedAt.UTC()
	}
	return l.CreatedAt.UTC()
}

// SaveInput 是创建与修改更新日志时的输入。
type SaveInput struct {
	Version     string     `json:"version"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Enabled     bool       `json:"enabled"`
	SortOrder   int        `json:"sort_order"`
	PublishedAt *time.Time `json:"published_at"`
}

// ListInput 是列表接口接收的分页参数。
type ListInput struct {
	Limit  int
	Offset int
}

// ListParams 是持久层实际使用的列表参数。
type ListParams struct {
	EnabledOnly bool
	Limit       int
	Offset      int
}

// ListOutput 是列表接口返回值。
type ListOutput struct {
	Items  []UpdateLog `json:"items"`
	Total  int         `json:"total"`
	Limit  int         `json:"limit"`
	Offset int         `json:"offset"`
}
