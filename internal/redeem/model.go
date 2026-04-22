package redeem

import "time"

const (
	StatusActive = "active"
	StatusUsed   = "used"
)

type Code struct {
	ID           uint64     `db:"id" json:"id"`
	Code         string     `db:"code" json:"code"`
	BatchID      string     `db:"batch_id" json:"batch_id"`
	Credits      int64      `db:"credits" json:"credits"`
	UsedByUserID uint64     `db:"used_by_user_id" json:"used_by_user_id"`
	UsedAt       *time.Time `db:"used_at" json:"used_at"`
	ExpiresAt    *time.Time `db:"expires_at" json:"expires_at"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

type GenerateInput struct {
	Credits  int64
	Quantity int
}

type ListFilter struct {
	BatchID string
	Status  string
}

type RedeemResult struct {
	Code         string `json:"code"`
	Credits      int64  `json:"credits"`
	BalanceAfter int64  `json:"balance_after"`
}
