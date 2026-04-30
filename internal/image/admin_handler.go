package image

import (
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

type adminTaskView struct {
	AdminTaskRow
	ResultURLsParsed  []string `json:"result_urls_parsed"`
	PreviewURLsParsed []string `json:"preview_urls_parsed"`
}

// AdminHandler 管理员视角下的生成记录接口。
type AdminHandler struct {
	dao *DAO
}

// NewAdminHandler 构造。
func NewAdminHandler(dao *DAO) *AdminHandler {
	return &AdminHandler{dao: dao}
}

// List GET /api/admin/image-tasks
// 查询参数:page / page_size / user_id / keyword(prompt 或邮箱模糊) / status
func (h *AdminHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if size < 1 {
		size = 20
	}
	if size > 200 {
		size = 200
	}
	userID, _ := strconv.ParseUint(c.Query("user_id"), 10, 64)

	f := AdminTaskFilter{
		UserID:  userID,
		Keyword: strings.TrimSpace(c.Query("keyword")),
		Status:  strings.TrimSpace(c.Query("status")),
	}
	if t, ok := parseFilterTime(c.Query("start_at")); ok {
		f.Since = t
	}
	if t, ok := parseFilterTime(c.Query("end_at")); ok {
		f.Until = t.Add(time.Second)
	}

	rows, total, err := h.dao.ListAdmin(c.Request.Context(), f, size, (page-1)*size)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}

	out := make([]adminTaskView, 0, len(rows))
	for _, r := range rows {
		out = append(out, adminTaskView{
			AdminTaskRow:      r,
			ResultURLsParsed:  buildAdminDownloadURLs(r),
			PreviewURLsParsed: buildAdminPreviewURLs(r),
		})
	}

	resp.OK(c, gin.H{
		"list":      out,
		"total":     total,
		"page":      page,
		"page_size": size,
	})
}

func buildAdminDownloadURLs(r AdminTaskRow) []string {
	urls := r.DecodeResultURLs()
	if len(urls) > 0 {
		return BuildProxyURLs(r.TaskID, urls)
	}
	if fids := r.DecodeFileIDs(); len(fids) > 0 {
		urls = make([]string, len(fids))
		for i := range fids {
			urls[i] = BuildProxyURL(r.TaskID, i, "")
		}
	}
	return urls
}

func buildAdminPreviewURLs(r AdminTaskRow) []string {
	rawURLs := r.DecodeResultURLs()
	thumbURLs := r.DecodeThumbURLs()
	fileIDs := r.DecodeFileIDs()

	count := len(rawURLs)
	if len(thumbURLs) > count {
		count = len(thumbURLs)
	}
	if len(fileIDs) > count {
		count = len(fileIDs)
	}
	if count == 0 {
		return nil
	}

	out := make([]string, count)
	for i := 0; i < count; i++ {
		if i < len(thumbURLs) {
			if u := strings.TrimSpace(thumbURLs[i]); u != "" {
				out[i] = u
				continue
			}
		}
		if i < len(rawURLs) {
			if u := strings.TrimSpace(rawURLs[i]); u != "" {
				out[i] = u
				continue
			}
		}
		if i < len(fileIDs) {
			out[i] = BuildProxyURL(r.TaskID, i, "")
		}
	}
	return out
}
