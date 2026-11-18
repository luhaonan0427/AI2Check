// 数研 MathFlow 领域类型：教师端与学生端共用的一套词汇。
// 界面和接口都只依赖这里的类型，方便以后替换存储或批改实现。

/** 平台角色。角色保存在 users 表，而不是靠前端切换。 */
export type Role = 'teacher' | 'student';

/** 作业分级。与需求一致：全对 / 部分正确（半对半错）/ 全错。 */
export type Category = '全对' | '部分正确' | '全错';

/** 提交状态。pending=已上传等批改；graded=批改完成待教师审核；approved=教师已审核定稿。 */
export type SubmissionStatus = 'pending' | 'graded' | 'approved';

export type User = {
  id: string;
  role: Role;
  displayName: string;
  email: string | null;
};

export type Course = {
  id: string;
  teacherId: string;
  name: string;
  code: string;
  term: string | null;
  joinCode: string;
  createdAt: string;
};

export type Enrollment = {
  id: string;
  courseId: string;
  studentId: string;
  studentNumber: string | null;
  status: string;
  createdAt: string;
};

export type Assignment = {
  id: string;
  courseId: string;
  title: string;
  chapter: string | null;
  due: string;
  maxScore: number;
  weight: number;
  questions: string;
  rubric: string;
  sequence: number;
  createdAt: string;
};

/** 单行的判定：这是「告诉学生第几行错了」的落点。 */
export type LineAssessment = {
  /** 上传顺序对应的页码；行号按每页从上到下计数。 */
  page?: number;
  /** 归一化原图坐标 [x, y, width, height]，无法定位时为 null。 */
  box?: [number, number, number, number] | null;
  /** 卷面上的行号，从 1 开始。 */
  line: number;
  /** 学生这行的原文；批改器无法可靠识别时为 null。 */
  text: string | null;
  /** 首次出错的行标记为 true，后续同源错误只是复述。 */
  isFirstError: boolean;
  issue: string | null;
  deduction: number;
};

export type QuestionAssessment = {
  /** 卷面上的题号，从 1 开始。 */
  number: number;
  score: number;
  maxScore: number;
  verdict: 'correct' | 'partial' | 'wrong';
  summary: string;
  lines: LineAssessment[];
};

/** 订正练习 + 拓展题：对应需求里的交互环节。 */
export type Practice = {
  prompt: string;
  hints: string[];
  /** 期望答案；用于本地判分，实际教学里可由教师覆盖。 */
  expected: string[];
  explain: string;
};

export type Extension = {
  prompt: string;
  level: '巩固' | '提高' | '拓展';
  goal: string;
};

export type Grade = {
  score: number;
  maxScore: number;
  category: Category;
  confidence: number;
  summary: string;
  questions: QuestionAssessment[];
  practice: Practice | null;
  extensions: Extension[];
  /**
   * true 表示这是占位批改，不是真实模型判分。
   * 教师端必须显著提示；正式成绩不得以此为准。
   */
  placeholder: boolean;
  /** 生成来源，例如 'mock' 或以后的 'openai:gpt-5'。 */
  source: string;
  generatedAt: string;
  needsReview?: boolean;
};

export type Submission = {
  id: string;
  assignmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  files: string[];
  status: SubmissionStatus;
  aiScore: number | null;
  aiPayload: Grade | null;
  finalScore: number | null;
  finalFeedback: string | null;
  category: Category | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
};

/** 满分为全对，零分为全错，正分且未满分为部分正确。 */
export function classify(score: number, max: number): Category {
  if (max <= 0) return '全错';
  if (score >= max) return '全对';
  if (score <= 0) return '全错';
  return '部分正确';
}

/** 学生看到的是教师定稿分；未审核时退回到批改建议分。 */
export function effectiveScore(submission: Submission): number | null {
  if (submission.status === 'approved') return submission.finalScore;
  return submission.aiScore;
}

/** 学生视角下，教师是否已经给出定稿反馈。 */
export function isReleased(submission: Submission): boolean {
  return submission.status === 'approved';
}
