package announcement

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

type DAO struct {
	db *sqlx.DB
}

func NewDAO(db *sqlx.DB) *DAO { return &DAO{db: db} }

func (d *DAO) List(ctx context.Context, enabledOnly bool) ([]Announcement, error) {
	where := "1=1"
	args := []any{}
	if enabledOnly {
		where = "enabled = ?"
		args = append(args, true)
	}
	rows := make([]Announcement, 0)
	err := d.db.SelectContext(ctx, &rows,
		`SELECT id, title, content, enabled, sort_order, created_at, updated_at
           FROM announcements
          WHERE `+where+`
          ORDER BY sort_order DESC, id DESC`,
		args...)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (d *DAO) Create(ctx context.Context, input Announcement) (*Announcement, error) {
	res, err := d.db.ExecContext(ctx,
		`INSERT INTO announcements (title, content, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
		input.Title, input.Content, input.Enabled, input.SortOrder, input.CreatedAt, input.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if id, err := res.LastInsertId(); err == nil {
		input.ID = uint64(id)
	}
	return &input, nil
}

func (d *DAO) Update(ctx context.Context, id uint64, input Announcement) (*Announcement, error) {
	res, err := d.db.ExecContext(ctx,
		`UPDATE announcements
            SET title = ?, content = ?, enabled = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`,
		input.Title, input.Content, input.Enabled, input.SortOrder, input.UpdatedAt, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	var out Announcement
	if err := d.db.GetContext(ctx, &out,
		`SELECT id, title, content, enabled, sort_order, created_at, updated_at
           FROM announcements
          WHERE id = ?`, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (d *DAO) Delete(ctx context.Context, id uint64) error {
	res, err := d.db.ExecContext(ctx, `DELETE FROM announcements WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
