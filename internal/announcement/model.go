package announcement

import (
	"errors"
	"time"
)

var (
	ErrInvalidInput = errors.New("announcement: invalid input")
	ErrNotFound     = errors.New("announcement: not found")
)

// Announcement 是后台维护的弹窗公告。
type Announcement struct {
	ID        uint64    `db:"id" json:"id"`
	Title     string    `db:"title" json:"title"`
	Content   string    `db:"content" json:"content"`
	Enabled   bool      `db:"enabled" json:"enabled"`
	SortOrder int       `db:"sort_order" json:"sort_order"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// SaveInput 是创建与修改公告时的输入。
type SaveInput struct {
	Title     string `json:"title"`
	Content   string `json:"content"`
	Enabled   bool   `json:"enabled"`
	SortOrder int    `json:"sort_order"`
}
