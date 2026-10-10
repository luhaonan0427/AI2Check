CREATE TABLE tutor_messages (
  id text PRIMARY KEY NOT NULL,
  submission_id text NOT NULL,
  student_id text NOT NULL,
  answer text NOT NULL,
  feedback text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX tutor_submission_idx ON tutor_messages(submission_id, created_at);
