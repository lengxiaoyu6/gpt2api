package model

import (
	"database/sql"
	"time"
)

// 模型类型。
const (
	TypeChat  = "chat"
	TypeImage = "image"
)

// Model 对应 models 表。
type Model struct {
	ID                  uint64       `db:"id" json:"id"`
	Slug                string       `db:"slug" json:"slug"`
	Type                string       `db:"type" json:"type"`
	UpstreamModelSlug   string       `db:"upstream_model_slug" json:"upstream_model_slug"`
	InputPricePer1M     int64        `db:"input_price_per_1m" json:"input_price_per_1m"`
	OutputPricePer1M    int64        `db:"output_price_per_1m" json:"output_price_per_1m"`
	CacheReadPricePer1M int64        `db:"cache_read_price_per_1m" json:"cache_read_price_per_1m"`
	ImagePricePerCall   int64        `db:"image_price_per_call" json:"image_price_per_call"`
	ImagePricePerCall2K int64        `db:"image_price_per_call_2k" json:"image_price_per_call_2k"`
	ImagePricePerCall4K int64        `db:"image_price_per_call_4k" json:"image_price_per_call_4k"`
	HasImageChannel     bool         `db:"has_image_channel" json:"has_image_channel"`
	SupportsMultiImage  bool         `db:"supports_multi_image" json:"supports_multi_image"`
	SupportsOutputSize  bool         `db:"supports_output_size" json:"supports_output_size"`
	Description         string       `db:"description" json:"description"`
	Enabled             bool         `db:"enabled" json:"enabled"`
	CreatedAt           time.Time    `db:"created_at" json:"created_at"`
	UpdatedAt           time.Time    `db:"updated_at" json:"updated_at"`
	DeletedAt           sql.NullTime `db:"deleted_at" json:"-"`
}
