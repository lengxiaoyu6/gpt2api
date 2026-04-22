package redeem

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrCodeNotFound    = errors.New("redeem: code not found")
	ErrCodeUsed        = errors.New("redeem: code already used")
	ErrCodeExpired     = errors.New("redeem: code expired")
	ErrInvalidCredits  = errors.New("redeem: invalid credits")
	ErrInvalidQuantity = errors.New("redeem: invalid quantity")
)

type store interface {
	InsertBatch(ctx context.Context, items []Code) error
	List(ctx context.Context, f ListFilter, offset, limit int) ([]Code, int64, error)
	Redeem(ctx context.Context, userID uint64, code string, now time.Time) (*RedeemResult, error)
}

type Service struct {
	store      store
	now        func() time.Time
	newCode    func() string
	newBatchID func(now time.Time) string
}

func NewService(store store) *Service {
	return &Service{
		store:      store,
		now:        time.Now,
		newCode:    randomCode,
		newBatchID: newBatchID,
	}
}

func (s *Service) Generate(ctx context.Context, in GenerateInput) ([]Code, error) {
	if in.Credits <= 0 {
		return nil, ErrInvalidCredits
	}
	if in.Quantity <= 0 {
		return nil, ErrInvalidQuantity
	}
	if s == nil || s.store == nil {
		return nil, errors.New("redeem: store not ready")
	}
	now := s.nowTime()
	batchID := s.newBatchID(now)
	items := make([]Code, 0, in.Quantity)
	for i := 0; i < in.Quantity; i++ {
		items = append(items, Code{
			Code:      normalizeCode(s.newCode()),
			BatchID:   batchID,
			Credits:   in.Credits,
			CreatedAt: now,
		})
	}
	if err := s.store.InsertBatch(ctx, items); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *Service) List(ctx context.Context, f ListFilter, offset, limit int) ([]Code, int64, error) {
	if s == nil || s.store == nil {
		return nil, 0, errors.New("redeem: store not ready")
	}
	return s.store.List(ctx, f, offset, limit)
}

func (s *Service) Redeem(ctx context.Context, userID uint64, code string) (*RedeemResult, error) {
	if s == nil || s.store == nil {
		return nil, errors.New("redeem: store not ready")
	}
	return s.store.Redeem(ctx, userID, normalizeCode(code), s.nowTime())
}

func (s *Service) nowTime() time.Time {
	if s != nil && s.now != nil {
		return s.now()
	}
	return time.Now()
}

func normalizeCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func randomCode() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return strings.ToUpper(hex.EncodeToString(buf))
}

func newBatchID(now time.Time) string {
	buf := make([]byte, 3)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return fmt.Sprintf("RC%s%s", now.Format("20060102150405"), strings.ToUpper(hex.EncodeToString(buf)))
}
