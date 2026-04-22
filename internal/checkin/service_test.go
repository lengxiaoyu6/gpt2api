package checkin

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

type fakeSettings struct{ reward int64 }

func (f fakeSettings) DailyCheckinCredits() int64 { return f.reward }

type fakeStore struct {
	mu      sync.Mutex
	byDay   map[string]*Record
	latest  *Record
	balance int64
	claims  int
}

func newFakeStore() *fakeStore {
	return &fakeStore{byDay: map[string]*Record{}}
}

func (s *fakeStore) GetByDay(_ context.Context, userID uint64, day string) (*Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneRecord(s.byDay[s.key(userID, day)]), nil
}

func (s *fakeStore) GetLatest(_ context.Context, _ uint64) (*Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneRecord(s.latest), nil
}

func (s *fakeStore) Claim(_ context.Context, userID uint64, in ClaimInput) (*Record, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := s.key(userID, in.Day)
	if rec, ok := s.byDay[key]; ok {
		return cloneRecord(rec), false, nil
	}
	s.claims++
	s.balance += in.AwardedCredits
	rec := &Record{
		ID:             uint64(s.claims),
		UserID:         userID,
		CheckinDay:     in.Day,
		CheckedAt:      in.CheckedAt,
		AwardedCredits: in.AwardedCredits,
		BalanceAfter:   s.balance,
		RefID:          in.RefID,
		Remark:         in.Remark,
	}
	s.byDay[key] = rec
	s.latest = rec
	return cloneRecord(rec), true, nil
}

func (s *fakeStore) key(userID uint64, day string) string {
	return fmt.Sprintf("%d:%s", userID, day)
}

func cloneRecord(in *Record) *Record {
	if in == nil {
		return nil
	}
	cp := *in
	return &cp
}

func TestServiceCheckinSuccessAndIdempotent(t *testing.T) {
	store := newFakeStore()
	svc := NewService(store, fakeSettings{reward: 20000})
	base := time.Date(2026, 4, 22, 8, 30, 0, 0, time.FixedZone("CST", 8*3600))
	svc.now = func() time.Time { return base }
	svc.loc = base.Location()

	got, err := svc.Checkin(context.Background(), 7)
	if err != nil {
		t.Fatalf("first checkin: %v", err)
	}
	if !got.Enabled || !got.CheckedIn {
		t.Fatalf("unexpected first status: %#v", got)
	}
	if got.Today != "2026-04-22" {
		t.Fatalf("today = %q, want 2026-04-22", got.Today)
	}
	if got.AwardedCredits != 20000 || got.BalanceAfter != 20000 {
		t.Fatalf("unexpected award result: %#v", got)
	}
	if got.CheckedAt != "2026-04-22 08:30:00" || got.LastCheckedAt != got.CheckedAt {
		t.Fatalf("unexpected checked time: %#v", got)
	}
	if store.claims != 1 {
		t.Fatalf("claims = %d, want 1", store.claims)
	}

	again, err := svc.Checkin(context.Background(), 7)
	if err != nil {
		t.Fatalf("second checkin: %v", err)
	}
	if !again.CheckedIn || again.AwardedCredits != 20000 || again.BalanceAfter != 20000 {
		t.Fatalf("unexpected second status: %#v", again)
	}
	if store.claims != 1 {
		t.Fatalf("claims = %d, want 1 after idempotent retry", store.claims)
	}
}

func TestServiceStatusAndCheckinAcrossDays(t *testing.T) {
	store := newFakeStore()
	svc := NewService(store, fakeSettings{reward: 15000})
	loc := time.FixedZone("CST", 8*3600)
	day1 := time.Date(2026, 4, 22, 23, 50, 0, 0, loc)
	day2 := time.Date(2026, 4, 23, 0, 5, 0, 0, loc)
	svc.loc = loc
	svc.now = func() time.Time { return day1 }

	if _, err := svc.Checkin(context.Background(), 9); err != nil {
		t.Fatalf("day1 checkin: %v", err)
	}

	svc.now = func() time.Time { return day2 }
	status, err := svc.Status(context.Background(), 9)
	if err != nil {
		t.Fatalf("day2 status: %v", err)
	}
	if status.CheckedIn {
		t.Fatalf("expected day2 before checkin to be unchecked: %#v", status)
	}
	if status.LastCheckedAt != "2026-04-22 23:50:00" {
		t.Fatalf("last checked = %q, want previous day", status.LastCheckedAt)
	}

	got, err := svc.Checkin(context.Background(), 9)
	if err != nil {
		t.Fatalf("day2 checkin: %v", err)
	}
	if got.Today != "2026-04-23" || got.CheckedAt != "2026-04-23 00:05:00" {
		t.Fatalf("unexpected day2 result: %#v", got)
	}
	if got.BalanceAfter != 30000 {
		t.Fatalf("balance_after = %d, want 30000", got.BalanceAfter)
	}
	if store.claims != 2 {
		t.Fatalf("claims = %d, want 2", store.claims)
	}
}

func TestServiceDisabledWhenRewardIsZero(t *testing.T) {
	store := newFakeStore()
	svc := NewService(store, fakeSettings{reward: 0})
	base := time.Date(2026, 4, 22, 9, 0, 0, 0, time.FixedZone("CST", 8*3600))
	svc.now = func() time.Time { return base }
	svc.loc = base.Location()

	status, err := svc.Status(context.Background(), 5)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.Enabled || status.TodayRewardCredits != 0 || status.Today != "2026-04-22" {
		t.Fatalf("unexpected disabled status: %#v", status)
	}

	_, err = svc.Checkin(context.Background(), 5)
	if !errors.Is(err, ErrDisabled) {
		t.Fatalf("error = %v, want ErrDisabled", err)
	}
	if store.claims != 0 {
		t.Fatalf("claims = %d, want 0", store.claims)
	}
}

func TestServiceCheckinConcurrentIdempotent(t *testing.T) {
	store := newFakeStore()
	svc := NewService(store, fakeSettings{reward: 12000})
	base := time.Date(2026, 4, 22, 10, 0, 0, 0, time.FixedZone("CST", 8*3600))
	svc.now = func() time.Time { return base }
	svc.loc = base.Location()

	const workers = 12
	errCh := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := svc.Checkin(context.Background(), 42)
			if err != nil {
				errCh <- err
				return
			}
			if !got.CheckedIn || got.AwardedCredits != 12000 || got.BalanceAfter != 12000 {
				errCh <- fmt.Errorf("unexpected status: %#v", got)
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}
	if store.claims != 1 {
		t.Fatalf("claims = %d, want 1", store.claims)
	}
}
