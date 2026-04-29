package updatelog

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

func (d *DAO) List(ctx context.Context, params ListParams) ([]UpdateLog, int, error) {
	where := "1=1"
	args := []any{}
	if params.EnabledOnly {
		where = "enabled = ?"
		args = append(args, true)
	}
	var total int
	if err := d.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM system_update_logs WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	rows := make([]UpdateLog, 0)
	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, params.Limit, params.Offset)
	err := d.db.SelectContext(ctx, &rows,
		`SELECT id, version, title, content, enabled, sort_order, published_at, created_at, updated_at
           FROM system_update_logs
          WHERE `+where+`
          ORDER BY sort_order DESC, COALESCE(published_at, created_at) DESC, id DESC
          LIMIT ? OFFSET ?`,
		queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (d *DAO) Create(ctx context.Context, input UpdateLog) (*UpdateLog, error) {
	res, err := d.db.ExecContext(ctx,
		`INSERT INTO system_update_logs (version, title, content, enabled, sort_order, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		input.Version, input.Title, input.Content, input.Enabled, input.SortOrder, input.PublishedAt, input.CreatedAt, input.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if id, err := res.LastInsertId(); err == nil {
		input.ID = uint64(id)
	}
	return &input, nil
}

func (d *DAO) Update(ctx context.Context, id uint64, input UpdateLog) (*UpdateLog, error) {
	res, err := d.db.ExecContext(ctx,
		`UPDATE system_update_logs
            SET version = ?, title = ?, content = ?, enabled = ?, sort_order = ?, published_at = ?, updated_at = ?
          WHERE id = ?`,
		input.Version, input.Title, input.Content, input.Enabled, input.SortOrder, input.PublishedAt, input.UpdatedAt, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	var out UpdateLog
	if err := d.db.GetContext(ctx, &out,
		`SELECT id, version, title, content, enabled, sort_order, published_at, created_at, updated_at
           FROM system_update_logs
          WHERE id = ?`, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (d *DAO) Delete(ctx context.Context, id uint64) error {
	res, err := d.db.ExecContext(ctx, `DELETE FROM system_update_logs WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
