package redeem

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

type billingWriter interface {
	RedeemTx(ctx context.Context, tx *sqlx.Tx, userID uint64, amount int64, refID, remark string) (int64, error)
}

type DAO struct {
	db      *sqlx.DB
	billing billingWriter
}

func NewDAO(db *sqlx.DB, billing billingWriter) *DAO {
	return &DAO{db: db, billing: billing}
}

func (d *DAO) InsertBatch(ctx context.Context, items []Code) error {
	if len(items) == 0 {
		return nil
	}
	tx, err := d.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()
	for _, item := range items {
		res, err := tx.ExecContext(ctx,
			`INSERT INTO redeem_codes (code, batch_id, credits, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
			item.Code, item.BatchID, item.Credits, item.ExpiresAt, item.CreatedAt)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		if id, idErr := res.LastInsertId(); idErr == nil {
			item.ID = uint64(id)
		}
	}
	return tx.Commit()
}

func (d *DAO) List(ctx context.Context, f ListFilter, offset, limit int) ([]Code, int64, error) {
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	where := []string{"1=1"}
	args := make([]any, 0, 4)
	if f.BatchID != "" {
		where = append(where, "batch_id = ?")
		args = append(args, f.BatchID)
	}
	switch f.Status {
	case StatusActive:
		where = append(where, "used_by_user_id = 0")
	case StatusUsed:
		where = append(where, "used_by_user_id > 0")
	}
	ws := strings.Join(where, " AND ")
	rows := make([]Code, 0, limit)
	if err := d.db.SelectContext(ctx, &rows,
		fmt.Sprintf(`SELECT id, code, batch_id, credits, used_by_user_id, used_at, expires_at, created_at
           FROM redeem_codes
          WHERE %s
          ORDER BY id DESC
          LIMIT ? OFFSET ?`, ws),
		append(args, limit, offset)...); err != nil {
		return nil, 0, err
	}
	var total int64
	if err := d.db.GetContext(ctx, &total,
		fmt.Sprintf(`SELECT COUNT(*) FROM redeem_codes WHERE %s`, ws), args...); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (d *DAO) Redeem(ctx context.Context, userID uint64, code string, now time.Time) (*RedeemResult, error) {
	if code == "" {
		return nil, ErrCodeNotFound
	}
	if d == nil || d.db == nil {
		return nil, errors.New("redeem: db not ready")
	}
	if d.billing == nil {
		return nil, errors.New("redeem: billing not ready")
	}
	tx, err := d.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	var item Code
	err = tx.GetContext(ctx, &item,
		`SELECT id, code, batch_id, credits, used_by_user_id, used_at, expires_at, created_at
           FROM redeem_codes
          WHERE code = ?
          FOR UPDATE`, code)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrCodeNotFound
		}
		return nil, err
	}
	if item.UsedByUserID != 0 {
		_ = tx.Rollback()
		return nil, ErrCodeUsed
	}
	if item.ExpiresAt != nil && item.ExpiresAt.Before(now) {
		_ = tx.Rollback()
		return nil, ErrCodeExpired
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE redeem_codes
            SET used_by_user_id = ?, used_at = ?
          WHERE id = ? AND used_by_user_id = 0`,
		userID, now, item.ID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_ = tx.Rollback()
		return nil, ErrCodeUsed
	}
	balanceAfter, err := d.billing.RedeemTx(ctx, tx, userID, item.Credits,
		fmt.Sprintf("redeem:%s", item.Code), fmt.Sprintf("redeem code %s", item.Code))
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &RedeemResult{Code: item.Code, Credits: item.Credits, BalanceAfter: balanceAfter}, nil
}
