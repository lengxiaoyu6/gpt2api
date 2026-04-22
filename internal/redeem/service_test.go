package redeem

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeStore struct {
	mu          sync.Mutex
	inserted    []Code
	codes       map[string]*Code
	balanceByID map[uint64]int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		codes:       map[string]*Code{},
		balanceByID: map[uint64]int64{},
	}
}

func (s *fakeStore) InsertBatch(_ context.Context, items []Code) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range items {
		cp := item
		s.inserted = append(s.inserted, cp)
		s.codes[cp.Code] = &cp
	}
	return nil
}

func (s *fakeStore) List(_ context.Context, f ListFilter, offset, limit int) ([]Code, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows := make([]Code, 0, len(s.codes))
	for _, item := range s.codes {
		if f.BatchID != "" && item.BatchID != f.BatchID {
			continue
		}
		switch f.Status {
		case StatusActive:
			if item.UsedByUserID != 0 {
				continue
			}
		case StatusUsed:
			if item.UsedByUserID == 0 {
				continue
			}
		}
		rows = append(rows, *item)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	total := int64(len(rows))
	if offset > len(rows) {
		return []Code{}, total, nil
	}
	end := offset + limit
	if end > len(rows) {
		end = len(rows)
	}
	return rows[offset:end], total, nil
}

func (s *fakeStore) Redeem(_ context.Context, userID uint64, code string, now time.Time) (*RedeemResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.codes[code]
	if !ok {
		return nil, ErrCodeNotFound
	}
	if item.UsedByUserID != 0 {
		return nil, ErrCodeUsed
	}
	if item.ExpiresAt != nil && item.ExpiresAt.Before(now) {
		return nil, ErrCodeExpired
	}
	item.UsedByUserID = userID
	item.UsedAt = ptrTime(now)
	s.balanceByID[userID] += item.Credits
	return &RedeemResult{Code: item.Code, Credits: item.Credits, BalanceAfter: s.balanceByID[userID]}, nil
}

func ptrTime(t time.Time) *time.Time { return &t }

func TestServiceGenerateBatch(t *testing.T) {
	store := newFakeStore()
	base := time.Date(2026, 4, 23, 10, 0, 0, 0, time.FixedZone("CST", 8*3600))
	svc := NewService(store)
	svc.now = func() time.Time { return base }
	svc.newBatchID = func(time.Time) string { return "BATCH20260423" }
	seq := 0
	svc.newCode = func() string {
		seq++
		return fmt.Sprintf("CODE%02d", seq)
	}

	items, err := svc.Generate(context.Background(), GenerateInput{Credits: 100000, Quantity: 3})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("len(items) = %d, want 3", len(items))
	}
	for i, item := range items {
		wantCode := fmt.Sprintf("CODE%02d", i+1)
		if item.Code != wantCode {
			t.Fatalf("item[%d].Code = %q, want %q", i, item.Code, wantCode)
		}
		if item.BatchID != "BATCH20260423" {
			t.Fatalf("item[%d].BatchID = %q", i, item.BatchID)
		}
		if item.Credits != 100000 {
			t.Fatalf("item[%d].Credits = %d", i, item.Credits)
		}
		if !item.CreatedAt.Equal(base) {
			t.Fatalf("item[%d].CreatedAt = %v, want %v", i, item.CreatedAt, base)
		}
	}
	if len(store.inserted) != 3 {
		t.Fatalf("len(store.inserted) = %d, want 3", len(store.inserted))
	}
}

func TestServiceGenerateValidateInput(t *testing.T) {
	svc := NewService(newFakeStore())

	_, err := svc.Generate(context.Background(), GenerateInput{Credits: 0, Quantity: 1})
	if !errors.Is(err, ErrInvalidCredits) {
		t.Fatalf("credits err = %v, want ErrInvalidCredits", err)
	}

	_, err = svc.Generate(context.Background(), GenerateInput{Credits: 1, Quantity: 0})
	if !errors.Is(err, ErrInvalidQuantity) {
		t.Fatalf("quantity err = %v, want ErrInvalidQuantity", err)
	}
}

func TestServiceListByStatusAndBatch(t *testing.T) {
	store := newFakeStore()
	usedAt := time.Date(2026, 4, 23, 11, 0, 0, 0, time.FixedZone("CST", 8*3600))
	store.codes["A1"] = &Code{ID: 1, Code: "A1", BatchID: "B1", Credits: 10}
	store.codes["A2"] = &Code{ID: 2, Code: "A2", BatchID: "B1", Credits: 10, UsedByUserID: 7, UsedAt: &usedAt}
	store.codes["B1"] = &Code{ID: 3, Code: "B1", BatchID: "B2", Credits: 20}
	svc := NewService(store)

	rows, total, err := svc.List(context.Background(), ListFilter{BatchID: "B1", Status: StatusUsed}, 0, 20)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].Code != "A2" {
		t.Fatalf("unexpected list result: total=%d rows=%+v", total, rows)
	}
}

func TestServiceRedeemSuccess(t *testing.T) {
	store := newFakeStore()
	store.codes["ABC123"] = &Code{ID: 1, Code: "ABC123", BatchID: "B1", Credits: 88888}
	base := time.Date(2026, 4, 23, 12, 0, 0, 0, time.FixedZone("CST", 8*3600))
	svc := NewService(store)
	svc.now = func() time.Time { return base }

	got, err := svc.Redeem(context.Background(), 9, "  abc123  ")
	if err != nil {
		t.Fatalf("Redeem: %v", err)
	}
	if got.Code != "ABC123" || got.Credits != 88888 || got.BalanceAfter != 88888 {
		t.Fatalf("unexpected redeem result: %#v", got)
	}
	if store.codes["ABC123"].UsedByUserID != 9 {
		t.Fatalf("used_by_user_id = %d, want 9", store.codes["ABC123"].UsedByUserID)
	}
	if store.codes["ABC123"].UsedAt == nil || !store.codes["ABC123"].UsedAt.Equal(base) {
		t.Fatalf("used_at = %v, want %v", store.codes["ABC123"].UsedAt, base)
	}
}

func TestServiceRedeemFailureCases(t *testing.T) {
	base := time.Date(2026, 4, 23, 12, 0, 0, 0, time.FixedZone("CST", 8*3600))
	tests := []struct {
		name    string
		prepare func(*fakeStore)
		code    string
		wantErr error
	}{
		{
			name:    "not found",
			prepare: func(*fakeStore) {},
			code:    "MISS",
			wantErr: ErrCodeNotFound,
		},
		{
			name: "used",
			prepare: func(store *fakeStore) {
				usedAt := base.Add(-time.Hour)
				store.codes["USED1"] = &Code{Code: "USED1", Credits: 10, UsedByUserID: 5, UsedAt: &usedAt}
			},
			code:    "USED1",
			wantErr: ErrCodeUsed,
		},
		{
			name: "expired",
			prepare: func(store *fakeStore) {
				expiresAt := base.Add(-time.Minute)
				store.codes["EXP1"] = &Code{Code: "EXP1", Credits: 10, ExpiresAt: &expiresAt}
			},
			code:    "EXP1",
			wantErr: ErrCodeExpired,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newFakeStore()
			tt.prepare(store)
			svc := NewService(store)
			svc.now = func() time.Time { return base }
			_, err := svc.Redeem(context.Background(), 9, tt.code)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeCode(t *testing.T) {
	got := normalizeCode("  ab-cd_12  ")
	if got != strings.ToUpper("ab-cd_12") {
		t.Fatalf("normalizeCode = %q", got)
	}
}
