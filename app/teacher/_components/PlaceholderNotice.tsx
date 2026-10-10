// 占位批改提示。
// 契约要求：aiPayload.placeholder === true 时界面必须显著提示，
// 不能让教师误以为这是真实模型对学生作答的判断。所有展示建议分的地方都复用这个组件。
export function PlaceholderNotice({ detail = true }: { detail?: boolean }) {
  return (
    <p className="notice placeholder-notice" role="alert">
      <strong>⚠ 占位批改，不代表对学生作答的判断</strong>
      {detail
        ? '系统尚未接入视觉模型，下面的建议分、逐行定位与订正建议都只是流程演示，也不能作为正式成绩；请对照学生原图逐份审核后再定稿。'
        : null}
    </p>
  );
}
