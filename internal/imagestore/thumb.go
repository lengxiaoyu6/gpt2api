package imagestore

import (
	"bytes"
	"image"
	"image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	DefaultThumbMaxEdge = 0
	DefaultThumbQuality = 82
)

type ThumbnailOptions struct {
	MaxEdge int
	Quality int
}

func BuildThumbnail(data []byte, opt ThumbnailOptions) ([]byte, string, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", err
	}
	maxEdge := opt.MaxEdge
	if maxEdge == 0 {
		maxEdge = DefaultThumbMaxEdge
	}
	quality := opt.Quality
	if quality <= 0 {
		quality = DefaultThumbQuality
	}
	bounds := img.Bounds()
	targetW, targetH := fitWithin(bounds.Dx(), bounds.Dy(), maxEdge)
	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), "image/jpeg", nil
}
