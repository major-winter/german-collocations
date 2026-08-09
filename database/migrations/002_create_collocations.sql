CREATE TABLE collocations (
left_word_id int not null references words(id),
right_word_id int not null references words(id),
cooccurrence int not null,
significance real not null,
primary key (left_word_id, right_word_id)

);

CREATE INDEX idx_collocations_left ON collocations(left_word_id);
CREATE INDEX idx_collocations_right ON collocations(right_word_id);
