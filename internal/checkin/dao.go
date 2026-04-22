package checkin

import (
	"context"
	"database/sql"
	"errors"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

type billingWriter interface {
	AwardCheckinTx(ctx context.Context, tx *sqlx.Tx, userID uint64, amount int64, refID, remark string) (int64, error)
}

type DAO struct {
	db      *sqlx.DB
	billing billingWriter
}

func NewDAO(db *sqlx.DB, billing billingWriter) *DAO {
	return &DAO{db: db, billing: billing}
}

func (d *DAO) GetByDay(ctx context.Context, userID uint64, day string) (*Record, error) {
	if d == nil || d.db == nil {
		return nil, nil
	}
	return d.getByDay(ctx, d.db, userID, day)
}

func (d *DAO) GetLatest(ctx context.Context, userID uint64) (*Record, error) {
	if d == nil || d.db == nil {
		return nil, nil
	}
	var rec Record
	err := d.db.GetContext(ctx, &rec, `
SELECT id, user_id,
       DATE_FORMAT(checkin_day, '%Y-%m-%d') AS checkin_day,
       checked_at, awarded_credits, balance_after, ref_id, remark
  FROM user_checkins
 WHERE user_id = ?
 ORDER BY checkin_day DESC, id DESC
 LIMIT 1`, userID)
	if err != nil {
		return nil, normalizeNotFound(err)
	}
	return &rec, nil
}

func (d *DAO) Claim(ctx context.Context, userID uint64, in ClaimInput) (*Record, bool, error) {
	if d == nil || d.db == nil {
		return nil, false, errors.New("checkin: db not ready")
	}
	if d.billing == nil {
		return nil, false, errors.New("checkin: billing not ready")
	}
	tx, err := d.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	_, err = tx.ExecContext(ctx, `
INSERT INTO user_checkins
    (user_id, checkin_day, checked_at, awarded_credits, balance_after, ref_id, remark)
VALUES (?, ?, ?, 0, 0, '', '')`, userID, in.Day, in.CheckedAt)
	if err != nil {
		_ = tx.Rollback()
		if isDuplicateErr(err) {
			rec, getErr := d.GetByDay(ctx, userID, in.Day)
			return rec, false, getErr
		}
		return nil, false, err
	}

	balanceAfter, err := d.billing.AwardCheckinTx(ctx, tx, userID, in.AwardedCredits, in.RefID, in.Remark)
	if err != nil {
		_ = tx.Rollback()
		return nil, false, err
	}

	_, err = tx.ExecContext(ctx, `
UPDATE user_checkins
   SET checked_at = ?, awarded_credits = ?, balance_after = ?, ref_id = ?, remark = ?
 WHERE user_id = ? AND checkin_day = ?`,
		in.CheckedAt, in.AwardedCredits, balanceAfter, in.RefID, in.Remark, userID, in.Day)
	if err != nil {
		_ = tx.Rollback()
		return nil, false, err
	}

	rec, err := d.getByDay(ctx, tx, userID, in.Day)
	if err != nil {
		_ = tx.Rollback()
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return rec, true, nil
}

type recordGetter interface {
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
}

func (d *DAO) getByDay(ctx context.Context, getter recordGetter, userID uint64, day string) (*Record, error) {
	var rec Record
	err := getter.GetContext(ctx, &rec, `
SELECT id, user_id,
       DATE_FORMAT(checkin_day, '%Y-%m-%d') AS checkin_day,
       checked_at, awarded_credits, balance_after, ref_id, remark
  FROM user_checkins
 WHERE user_id = ? AND checkin_day = ?
 LIMIT 1`, userID, day)
	if err != nil {
		if normalizeNotFound(err) == nil {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

func isDuplicateErr(err error) bool {
	var mysqlErr *mysqlDriver.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == 1062
	}
	return false
}

func normalizeNotFound(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}
