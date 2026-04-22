package gateway

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/432539/gpt2api/internal/image"
)

const (
	defaultImageProxyCacheTTL        = 30 * time.Minute
	defaultImageProxyCacheMaxEntries = 64
)

var defaultImageBytesCache = newImageProxyCache(defaultImageProxyCacheTTL, defaultImageProxyCacheMaxEntries)

type imageProxyFetcher interface {
	Fetch(ctx context.Context, task *image.Task, ref string) ([]byte, string, error)
}

type imageProxyFetchFunc func(ctx context.Context, task *image.Task, ref string) ([]byte, string, error)

func (f imageProxyFetchFunc) Fetch(ctx context.Context, task *image.Task, ref string) ([]byte, string, error) {
	return f(ctx, task, ref)
}

type cachedProxyImage struct {
	body        []byte
	contentType string
	expiresAt   time.Time
	storedAt    time.Time
}

type imageProxyCache struct {
	ttl        time.Duration
	maxEntries int
	now        func() time.Time

	mu    sync.RWMutex
	items map[string]cachedProxyImage
}

func newImageProxyCache(ttl time.Duration, maxEntries int) *imageProxyCache {
	if ttl <= 0 {
		ttl = defaultImageProxyCacheTTL
	}
	if maxEntries <= 0 {
		maxEntries = defaultImageProxyCacheMaxEntries
	}
	return &imageProxyCache{
		ttl:        ttl,
		maxEntries: maxEntries,
		now:        time.Now,
		items:      make(map[string]cachedProxyImage, maxEntries),
	}
}

func (c *imageProxyCache) get(key string) ([]byte, string, bool) {
	now := c.now()

	c.mu.RLock()
	item, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, "", false
	}
	if !item.expiresAt.After(now) {
		c.mu.Lock()
		if current, ok := c.items[key]; ok && !current.expiresAt.After(now) {
			delete(c.items, key)
		}
		c.mu.Unlock()
		return nil, "", false
	}
	return cloneBytes(item.body), item.contentType, true
}

func (c *imageProxyCache) set(key string, body []byte, contentType string) {
	now := c.now()

	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = cachedProxyImage{
		body:        cloneBytes(body),
		contentType: contentType,
		expiresAt:   now.Add(c.ttl),
		storedAt:    now,
	}
	c.evictLocked(now)
}

func (c *imageProxyCache) evictLocked(now time.Time) {
	for key, item := range c.items {
		if !item.expiresAt.After(now) {
			delete(c.items, key)
		}
	}
	for len(c.items) > c.maxEntries {
		oldestKey := ""
		var oldestAt time.Time
		for key, item := range c.items {
			if oldestKey == "" || item.storedAt.Before(oldestAt) {
				oldestKey = key
				oldestAt = item.storedAt
			}
		}
		if oldestKey == "" {
			return
		}
		delete(c.items, oldestKey)
	}
}

func (h *ImagesHandler) proxyImageCache() *imageProxyCache {
	if h != nil && h.imageProxyCache != nil {
		return h.imageProxyCache
	}
	return defaultImageBytesCache
}

func (h *ImagesHandler) proxyImageFetcher() imageProxyFetcher {
	if h != nil && h.imageProxyFetcher != nil {
		return h.imageProxyFetcher
	}
	return imageProxyFetchFunc(h.fetchProxyImageFromUpstream)
}

func (h *ImagesHandler) loadProxyImage(ctx context.Context, task *image.Task, idx int, ref string) ([]byte, string, error) {
	cacheKey := fmt.Sprintf("%s:%d", task.TaskID, idx)
	cache := h.proxyImageCache()
	if body, contentType, ok := cache.get(cacheKey); ok {
		return body, contentType, nil
	}

	body, contentType, err := h.proxyImageFetcher().Fetch(ctx, task, ref)
	if err != nil {
		return nil, "", err
	}
	cache.set(cacheKey, body, contentType)
	return cloneBytes(body), contentType, nil
}

func cloneBytes(src []byte) []byte {
	if len(src) == 0 {
		return nil
	}
	dst := make([]byte, len(src))
	copy(dst, src)
	return dst
}
