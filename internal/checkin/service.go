package checkin

import (
	"context"
	"errors"
	"time"
)

const (
	dateLayout     = "2006-01-02"
	dateTimeLayout = "2006-01-02 15:04:05"
)

var ErrDisabled = errors.New("checkin: disabled")

type settingsProvider interface {
	DailyCheckinCredits() int64
}

type store interface {
	GetByDay(ctx context.Context, userID uint64, day string) (*Record, error)
	GetLatest(ctx context.Context, userID uint64) (*Record, error)
	Claim(ctx context.Context, userID uint64, in ClaimInput) (*Record, bool, error)
}

type Record struct {
	ID             uint64    `db:"id"`
	UserID         uint64    `db:"user_id"`
	CheckinDay     string    `db:"checkin_day"`
	CheckedAt      time.Time `db:"checked_at"`
	AwardedCredits int64     `db:"awarded_credits"`
	BalanceAfter   int64     `db:"balance_after"`
	RefID          string    `db:"ref_id"`
	Remark         string    `db:"remark"`
}

type ClaimInput struct {
	Day            string
	CheckedAt      time.Time
	AwardedCredits int64
	RefID          string
	Remark         string
}

type Status struct {
	Enabled            bool   `json:"enabled"`
	Today              string `json:"today"`
	CheckedIn          bool   `json:"checked_in"`
	TodayRewardCredits int64  `json:"today_reward_credits"`
	CheckedAt          string `json:"checked_at"`
	LastCheckedAt      string `json:"last_checked_at"`
	BalanceAfter       int64  `json:"balance_after"`
	AwardedCredits     int64  `json:"awarded_credits"`
}

type Service struct {
	store    store
	settings settingsProvider
	now      func() time.Time
	loc      *time.Location
}

func NewService(store store, settings settingsProvider) *Service {
	return &Service{store: store, settings: settings, now: time.Now, loc: time.Local}
}

func (s *Service) Status(ctx context.Context, userID uint64) (Status, error) {
	now := s.currentTime()
	today := now.In(s.location()).Format(dateLayout)
	reward := s.rewardCredits()
	out := Status{
		Enabled:            reward > 0,
		Today:              today,
		TodayRewardCredits: reward,
	}
	if s.store == nil {
		return out, nil
	}
	latest, err := s.store.GetLatest(ctx, userID)
	if err != nil {
		return Status{}, err
	}
	if latest != nil {
		out.LastCheckedAt = formatTime(latest.CheckedAt)
	}
	todayRec, err := s.store.GetByDay(ctx, userID, today)
	if err != nil {
		return Status{}, err
	}
	if todayRec != nil {
		out.CheckedIn = true
		out.CheckedAt = formatTime(todayRec.CheckedAt)
		out.LastCheckedAt = out.CheckedAt
		out.BalanceAfter = todayRec.BalanceAfter
		out.AwardedCredits = todayRec.AwardedCredits
	}
	return out, nil
}

func (s *Service) Checkin(ctx context.Context, userID uint64) (Status, error) {
	reward := s.rewardCredits()
	if reward <= 0 {
		out, err := s.Status(ctx, userID)
		if err != nil {
			return Status{}, err
		}
		return out, ErrDisabled
	}
	if s.store == nil {
		return Status{}, errors.New("checkin: store not ready")
	}
	now := s.currentTime()
	day := now.In(s.location()).Format(dateLayout)
	rec, _, err := s.store.Claim(ctx, userID, ClaimInput{
		Day:            day,
		CheckedAt:      now.In(s.location()),
		AwardedCredits: reward,
		RefID:          "checkin:" + day,
		Remark:         "daily checkin",
	})
	if err != nil {
		return Status{}, err
	}
	if rec == nil {
		return Status{}, errors.New("checkin: empty claim result")
	}
	return Status{
		Enabled:            true,
		Today:              day,
		CheckedIn:          true,
		TodayRewardCredits: reward,
		CheckedAt:          formatTime(rec.CheckedAt),
		LastCheckedAt:      formatTime(rec.CheckedAt),
		BalanceAfter:       rec.BalanceAfter,
		AwardedCredits:     rec.AwardedCredits,
	}, nil
}

func (s *Service) rewardCredits() int64 {
	if s.settings == nil {
		return 0
	}
	n := s.settings.DailyCheckinCredits()
	if n < 0 {
		return 0
	}
	return n
}

func (s *Service) currentTime() time.Time {
	if s != nil && s.now != nil {
		return s.now()
	}
	return time.Now()
}

func (s *Service) location() *time.Location {
	if s != nil && s.loc != nil {
		return s.loc
	}
	return time.Local
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(dateTimeLayout)
}
