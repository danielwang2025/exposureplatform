-- A "teacher" member role, ranked between viewer and editor so that every
-- existing "at least viewer" check (seeing the child, its members, its
-- skills) includes teachers and every "at least editor" check excludes them.
-- What teachers may read and write is defined in the next migration; a new
-- enum value can't be used in the transaction that adds it.
alter type public.member_role add value 'teacher' before 'editor';
