package image

import (
	"os"
	"strings"
	"testing"
)

func TestDAOCreateStoresEmptyUpscaleForNewTasks(t *testing.T) {
	srcBytes, err := os.ReadFile("dao.go")
	if err != nil {
		t.Fatalf("read dao.go: %v", err)
	}
	src := string(srcBytes)
	if strings.Contains(src, "ValidateUpscale(t.Upscale)") {
		t.Fatalf("DAO.Create still persists caller supplied upscale")
	}
	if !strings.Contains(src, `t.Prompt, t.N, t.Size, "", NormalizeStorageMode(t.StorageMode)`) {
		t.Fatalf("DAO.Create should write an empty upscale value for new tasks")
	}
}
