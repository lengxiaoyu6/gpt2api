package image

import "fmt"

type TaskProgressMeta struct {
	Phase           string `json:"phase"`
	PhaseLabel      string `json:"phase_label"`
	EstimatedCredit int64  `json:"estimated_credit"`
	ActualCount     int    `json:"actual_count"`
	BillingStatus   string `json:"billing_status"`
	BillingNote     string `json:"billing_note"`
}

func BuildTaskProgressMeta(t *Task) TaskProgressMeta {
	if t == nil {
		return TaskProgressMeta{
			Phase:         "unknown",
			PhaseLabel:    "状态未知",
			BillingStatus: "unknown",
		}
	}

	actualCount := taskActualCount(t)
	phase, phaseLabel := taskPhaseMeta(t.Status)
	billingStatus, billingNote := taskBillingMeta(t, actualCount)

	return TaskProgressMeta{
		Phase:           phase,
		PhaseLabel:      phaseLabel,
		EstimatedCredit: t.EstimatedCredit,
		ActualCount:     actualCount,
		BillingStatus:   billingStatus,
		BillingNote:     billingNote,
	}
}

func taskActualCount(t *Task) int {
	if t == nil {
		return 0
	}
	count := len(t.DecodeResultURLs())
	if n := len(t.DecodeFileIDs()); n > count {
		count = n
	}
	if n := len(t.DecodeThumbURLs()); n > count {
		count = n
	}
	return count
}

func taskPhaseMeta(status string) (string, string) {
	switch status {
	case StatusQueued:
		return "queued", "排队中"
	case StatusDispatched:
		return "preparing", "准备中"
	case StatusRunning:
		return "generating", "生成中"
	case StatusSuccess:
		return "completed", "已完成"
	case StatusFailed:
		return "failed", "生成失败"
	default:
		return "unknown", "状态未知"
	}
}

func taskBillingMeta(t *Task, actualCount int) (string, string) {
	requestedCount := t.N
	if requestedCount <= 0 {
		requestedCount = 1
	}

	switch t.Status {
	case StatusQueued, StatusDispatched, StatusRunning:
		if t.EstimatedCredit > 0 {
			return "pending", fmt.Sprintf("已预扣 %d 积分，完成后按实际结果结算", t.EstimatedCredit)
		}
		return "pending", "任务处理中，完成后展示结算结果"
	case StatusFailed:
		if t.EstimatedCredit > 0 {
			return "refunded", fmt.Sprintf("任务失败，已退回预扣的 %d 积分", t.EstimatedCredit)
		}
		return "free", "任务失败，未产生积分扣除"
	case StatusSuccess:
		if actualCount > 0 && actualCount < requestedCount {
			if t.CreditCost > 0 {
				return "settled_partial", fmt.Sprintf("提交 %d 张，成功 %d 张，已按实际结果扣除 %d 积分", requestedCount, actualCount, t.CreditCost)
			}
			return "free", fmt.Sprintf("提交 %d 张，成功 %d 张，本次未产生积分扣除", requestedCount, actualCount)
		}
		if t.CreditCost > 0 {
			return "settled", fmt.Sprintf("成功生成 %d 张，已扣除 %d 积分", maxInt(actualCount, requestedCount), t.CreditCost)
		}
		if actualCount > 0 {
			return "free", fmt.Sprintf("成功生成 %d 张，本次未产生积分扣除", actualCount)
		}
		return "free", "任务已完成，本次未产生积分扣除"
	default:
		if t.CreditCost > 0 {
			return "settled", fmt.Sprintf("已扣除 %d 积分", t.CreditCost)
		}
		return "unknown", ""
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
