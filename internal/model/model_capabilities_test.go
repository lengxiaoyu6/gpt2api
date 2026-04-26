package model

import (
	"encoding/json"
	"testing"
)

func TestModelImageCapabilitiesJSONFields(t *testing.T) {
	m := Model{
		ImagePricePerCall:   100,
		ImagePricePerCall2K: 200,
		ImagePricePerCall4K: 400,
		SupportsMultiImage: true,
		SupportsOutputSize: false,
	}

	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal model: %v", err)
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		t.Fatalf("unmarshal model: %v", err)
	}
	if got := obj["supports_multi_image"]; got != true {
		t.Fatalf("supports_multi_image = %#v, want true", got)
	}
	if got := obj["supports_output_size"]; got != false {
		t.Fatalf("supports_output_size = %#v, want false", got)
	}
	if got := obj["image_price_per_call"]; got != float64(100) {
		t.Fatalf("image_price_per_call = %#v, want 100", got)
	}
	if got := obj["image_price_per_call_2k"]; got != float64(200) {
		t.Fatalf("image_price_per_call_2k = %#v, want 200", got)
	}
	if got := obj["image_price_per_call_4k"]; got != float64(400) {
		t.Fatalf("image_price_per_call_4k = %#v, want 400", got)
	}
}
