package proxy

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/432539/gpt2api/pkg/lock"
)

const runtimeFailureDeductScore = 20

// Allocator 负责运行态临时代理租用。
type Allocator struct {
	dao  *DAO
	svc  *Service
	lock *lock.RedisLock
	ttl  time.Duration
}

// Lease 是一次运行态临时代理租约。
type Lease struct {
	ProxyID     uint64
	ProxyURL    string
	lockKey     string
	lockToken   string
	dao         *DAO
	lock        *lock.RedisLock
	failureOnce sync.Once
	releaseOnce sync.Once
}

func NewAllocator(dao *DAO, svc *Service, redisLock *lock.RedisLock, ttl time.Duration) *Allocator {
	if ttl <= 0 {
		ttl = 180 * time.Second
	}
	return &Allocator{dao: dao, svc: svc, lock: redisLock, ttl: ttl}
}

// Lease 按健康分与最近使用时间挑选一个当前空闲代理。
// 返回 nil, nil 表示当前请求回退为直连。
func (a *Allocator) Lease(ctx context.Context) (*Lease, error) {
	if a == nil || a.dao == nil || a.svc == nil || a.lock == nil {
		return nil, nil
	}
	candidates, err := a.dao.ListRuntimeCandidates(ctx, 64)
	if err != nil {
		return nil, err
	}
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		lockKey := fmt.Sprintf("proxy:lease:%d", candidate.ID)
		lockToken := uuid.NewString()
		if err := a.lock.Acquire(ctx, lockKey, lockToken, a.ttl); err != nil {
			if errors.Is(err, lock.ErrNotAcquired) {
				continue
			}
			return nil, err
		}

		proxyURL, err := a.svc.BuildURL(candidate)
		if err != nil {
			_ = a.lock.Release(ctx, lockKey, lockToken)
			return nil, err
		}
		if err := a.dao.TouchLastUsed(ctx, candidate.ID); err != nil {
			_ = a.lock.Release(ctx, lockKey, lockToken)
			return nil, err
		}
		return &Lease{
			ProxyID:   candidate.ID,
			ProxyURL:  proxyURL,
			lockKey:   lockKey,
			lockToken: lockToken,
			dao:       a.dao,
			lock:      a.lock,
		}, nil
	}
	return nil, nil
}

func (l *Lease) Release(ctx context.Context) error {
	if l == nil || l.lock == nil || l.lockKey == "" || l.lockToken == "" {
		return nil
	}
	var releaseErr error
	l.releaseOnce.Do(func() {
		releaseErr = l.lock.Release(ctx, l.lockKey, l.lockToken)
	})
	return releaseErr
}

func (l *Lease) MarkFailure(ctx context.Context, summary string) error {
	if l == nil || l.dao == nil || l.ProxyID == 0 {
		return nil
	}
	summary = strings.TrimSpace(summary)
	if summary == "" {
		summary = "runtime proxy failure"
	}
	if len(summary) > 255 {
		summary = summary[:255]
	}
	var markErr error
	l.failureOnce.Do(func() {
		markErr = l.dao.DeductHealthOnRuntimeFailure(ctx, l.ProxyID, runtimeFailureDeductScore, summary)
	})
	return markErr
}
