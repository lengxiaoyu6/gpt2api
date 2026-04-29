package promptlib

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

type DAO struct {
	db *sqlx.DB
}

func NewDAO(db *sqlx.DB) *DAO { return &DAO{db: db} }

type promptRow struct {
	ID              uint64         `db:"id"`
	Title           string         `db:"title"`
	Content         string         `db:"content"`
	Category        string         `db:"category"`
	PreviewImageURL string         `db:"preview_image_url"`
	Tags            sql.NullString `db:"tags"`
	Enabled         bool           `db:"enabled"`
	SortOrder       int            `db:"sort_order"`
	CreatedAt       time.Time      `db:"created_at"`
	UpdatedAt       time.Time      `db:"updated_at"`
}

func (d *DAO) List(ctx context.Context, params ListParams) ([]PromptLibraryItem, int, error) {
	where, args := buildListWhere(params)
	var total int
	if err := d.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM prompt_library_items WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, params.Limit, params.Offset)
	rows := make([]promptRow, 0)
	err := d.db.SelectContext(ctx, &rows,
		`SELECT id, title, content, category, preview_image_url, CAST(tags AS CHAR) AS tags, enabled, sort_order, created_at, updated_at
           FROM prompt_library_items
          WHERE `+where+`
          ORDER BY sort_order DESC, id DESC
          LIMIT ? OFFSET ?`,
		queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	items := make([]PromptLibraryItem, 0, len(rows))
	for _, row := range rows {
		item, err := row.toItem()
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, nil
}

func (d *DAO) Categories(ctx context.Context) ([]string, error) {
	rows := make([]string, 0)
	err := d.db.SelectContext(ctx, &rows,
		`SELECT DISTINCT category
           FROM prompt_library_items
          WHERE enabled = ?
          ORDER BY category ASC`, true)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (d *DAO) Create(ctx context.Context, input PromptLibraryItem) (*PromptLibraryItem, error) {
	tags, err := marshalTags(input.Tags)
	if err != nil {
		return nil, err
	}
	res, err := d.db.ExecContext(ctx,
		`INSERT INTO prompt_library_items (title, content, category, preview_image_url, tags, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.Title, input.Content, input.Category, input.PreviewImageURL, tags, input.Enabled, input.SortOrder, input.CreatedAt, input.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if id, err := res.LastInsertId(); err == nil {
		input.ID = uint64(id)
	}
	return &input, nil
}

func (d *DAO) Update(ctx context.Context, id uint64, input PromptLibraryItem) (*PromptLibraryItem, error) {
	tags, err := marshalTags(input.Tags)
	if err != nil {
		return nil, err
	}
	res, err := d.db.ExecContext(ctx,
		`UPDATE prompt_library_items
            SET title = ?, content = ?, category = ?, preview_image_url = ?, tags = ?, enabled = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`,
		input.Title, input.Content, input.Category, input.PreviewImageURL, tags, input.Enabled, input.SortOrder, input.UpdatedAt, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return d.get(ctx, id)
}

func (d *DAO) Delete(ctx context.Context, id uint64) error {
	res, err := d.db.ExecContext(ctx, `DELETE FROM prompt_library_items WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (d *DAO) get(ctx context.Context, id uint64) (*PromptLibraryItem, error) {
	var row promptRow
	if err := d.db.GetContext(ctx, &row,
		`SELECT id, title, content, category, preview_image_url, CAST(tags AS CHAR) AS tags, enabled, sort_order, created_at, updated_at
           FROM prompt_library_items
          WHERE id = ?`, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	item, err := row.toItem()
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func buildListWhere(params ListParams) (string, []any) {
	parts := []string{"1=1"}
	args := []any{}
	if params.EnabledOnly {
		parts = append(parts, "enabled = ?")
		args = append(args, true)
	} else if params.Enabled != nil {
		parts = append(parts, "enabled = ?")
		args = append(args, *params.Enabled)
	}
	if params.Category != "" {
		parts = append(parts, "category = ?")
		args = append(args, params.Category)
	}
	if params.Keyword != "" {
		like := "%" + params.Keyword + "%"
		parts = append(parts, "(title LIKE ? OR content LIKE ? OR CAST(tags AS CHAR) LIKE ?)")
		args = append(args, like, like, like)
	}
	return strings.Join(parts, " AND "), args
}

func (row promptRow) toItem() (PromptLibraryItem, error) {
	tags, err := unmarshalTags(row.Tags)
	if err != nil {
		return PromptLibraryItem{}, err
	}
	return PromptLibraryItem{
		ID:              row.ID,
		Title:           row.Title,
		Content:         row.Content,
		Category:        row.Category,
		PreviewImageURL: row.PreviewImageURL,
		Tags:            tags,
		Enabled:         row.Enabled,
		SortOrder:       row.SortOrder,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}, nil
}

func marshalTags(tags []string) (any, error) {
	if len(tags) == 0 {
		return nil, nil
	}
	body, err := json.Marshal(tags)
	if err != nil {
		return nil, fmt.Errorf("marshal prompt tags: %w", err)
	}
	return string(body), nil
}

func unmarshalTags(raw sql.NullString) ([]string, error) {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return []string{}, nil
	}
	var tags []string
	if err := json.Unmarshal([]byte(raw.String), &tags); err != nil {
		return nil, fmt.Errorf("unmarshal prompt tags: %w", err)
	}
	return normalizeTags(tags), nil
}
