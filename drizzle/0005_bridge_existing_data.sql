-- Copy existing AI2Check records into the unified platform; originals remain intact.
INSERT OR IGNORE INTO campus_accounts(id,username,name,number,password,recovery,role,teacher_request,created)
 SELECT id,'legacy_'||lower(hex(CAST(id AS blob))),display_name,
 COALESCE((SELECT student_number FROM enrollments WHERE student_id=users.id AND student_number IS NOT NULL LIMIT 1),'未填写'),
 '!','!',role,'none',COALESCE(unixepoch(created_at)*1000,0) FROM users;
INSERT OR IGNORE INTO campus_courses(id,owner,title,term,description,created)
 SELECT id,teacher_id,name,COALESCE(term,'未填写'),code,COALESCE(unixepoch(created_at)*1000,0) FROM courses;
INSERT OR IGNORE INTO campus_classes(id,course_id,name,code,open)
 SELECT id,id,name||' · 原课程班',upper(hex(randomblob(5))),1 FROM courses;
INSERT OR IGNORE INTO campus_enrollments(id,class_id,user_id,status,created)
 SELECT course_id||':'||student_id,course_id,student_id,status,COALESCE(unixepoch(created_at)*1000,0) FROM enrollments;
INSERT OR IGNORE INTO campus_assignments(id,class_id,title,body,rubric,deadline,max_score,weight,allow_late,created)
 SELECT id,course_id,title,questions,rubric,
 COALESCE(CASE WHEN length(due)=16 THEN unixepoch(due,'-8 hours') ELSE unixepoch(due) END*1000,0),max_score,weight,1,COALESCE(unixepoch(created_at)*1000,0) FROM assignments;
INSERT OR IGNORE INTO campus_submissions(id,assignment_id,student_id,files,answer,version,status,score,feedback,submitted,reviewed,ai_score,ai_payload)
 SELECT assignment_id||':'||student_id,assignment_id,student_id,
 COALESCE((SELECT json_group_array(substr(submissions.assignment_id,1,18)||substr(j.value,19)) FROM json_each(submissions.files) j),'[]'),'',1,status,final_score,COALESCE(final_feedback,''),
 COALESCE(unixepoch(submitted_at)*1000,0),unixepoch(reviewed_at)*1000,ai_score,ai_payload FROM submissions;
INSERT OR IGNORE INTO campus_uploads(id,owner,assignment_id,mime,size,created,storage_key)
 SELECT substr(s.assignment_id,1,18)||substr(j.value,19),s.student_id,s.assignment_id,'image/jpeg',0,COALESCE(unixepoch(s.submitted_at)*1000,0),s.student_id||'/'||j.value
 FROM submissions s,json_each(s.files) j;
INSERT OR IGNORE INTO campus_tutor_messages(id,submission_id,version,student_id,answer,feedback,created_at)
 SELECT t.id,s.assignment_id||':'||s.student_id,1,t.student_id,t.answer,t.feedback,t.created_at
 FROM tutor_messages t JOIN submissions s ON s.id=t.submission_id;
