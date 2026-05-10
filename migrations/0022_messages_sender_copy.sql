-- E2EE messages were stored as a single encryption to the recipient's
-- public key, so the SENDER had no way to decrypt their own outgoing
-- messages on reload — the cipher_text could only be opened with the
-- recipient's private key. The UI loadMessages() then quietly hid
-- those rows as "undecryptable", which from Hakan's POV looked like
-- "I send a message and it disappears."
--
-- Fix: encrypt every message TWICE on send — once to the recipient
-- (cipher_text / aes_key / iv) and once to the sender's own pubkey
-- (sender_cipher_text / sender_aes_key / sender_iv). The viewer
-- decrypts whichever pair was encrypted to *them*. Both columns are
-- nullable so old rows continue to work for the recipient side.
ALTER TABLE messages ADD COLUMN sender_cipher_text TEXT;
ALTER TABLE messages ADD COLUMN sender_aes_key TEXT;
ALTER TABLE messages ADD COLUMN sender_iv TEXT;
