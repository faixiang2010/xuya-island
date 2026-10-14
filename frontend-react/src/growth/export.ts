/** 显式下载个人报告；数据来自当前账户或已授权的管理员查询。 */
export function exportLearningReport(report: Record<string, unknown>) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  const period =
    typeof report.period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(report.period)
      ? report.period
      : '本周'
  link.download = `叙芽岛-学习报告-${period}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
