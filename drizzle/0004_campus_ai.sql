ALTER TABLE campus_submissions ADD COLUMN ai_score real;
ALTER TABLE campus_submissions ADD COLUMN ai_payload text;
ALTER TABLE campus_uploads ADD COLUMN storage_key text;
CREATE TABLE campus_tutor_messages (
 id text PRIMARY KEY NOT NULL,
 submission_id text NOT NULL,
 version integer NOT NULL,
 student_id text NOT NULL,
 answer text NOT NULL,
 feedback text NOT NULL,
 created_at text NOT NULL
);
CREATE INDEX campus_tutor_submission ON campus_tutor_messages(submission_id,version,created_at);
