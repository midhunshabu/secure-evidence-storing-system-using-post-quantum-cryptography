"""Post-Quantum crypto utilities powered by liboqs."""

import base64
import os
import secrets
from typing import Optional

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

try:
    import oqs  # type: ignore
    HAS_OQS = True
except ImportError:
    HAS_OQS = False

class PQCEngine:
    """Post-Quantum Cryptographic Engine."""

    def __init__(self):
        self.allow_insecure_fallback = (
            os.getenv("PQC_ALLOW_INSECURE_FALLBACK", "").lower() == "true"
        )
        self.kex_algorithm = "Kyber512"
        self.sig_algorithm = "Dilithium2"

        if HAS_OQS:
            self.kex_algorithm = self._pick_algorithm(
                oqs.get_enabled_kem_mechanisms(),
                ["ML-KEM-768", "Kyber768", "ML-KEM-512", "Kyber512"],
            )
            self.sig_algorithm = self._pick_algorithm(
                oqs.get_enabled_sig_mechanisms(),
                ["ML-DSA-65", "Dilithium3", "ML-DSA-44", "Dilithium2"],
            )
        elif not self.allow_insecure_fallback:
            raise RuntimeError(
                "liboqs is required for real PQC mode. Install oqs-python and set up liboqs, "
                "or explicitly set PQC_ALLOW_INSECURE_FALLBACK=true for local development only."
            )

    @staticmethod
    def _pick_algorithm(enabled, preferred):
        for candidate in preferred:
            if candidate in enabled:
                return candidate
        if enabled:
            return enabled[0]
        raise RuntimeError("No supported OQS algorithms available.")

    @staticmethod
    def _looks_like_pem_key(key_b64: str) -> bool:
        try:
            raw = base64.b64decode(key_b64)
        except Exception:
            return False
        return raw.startswith(b"-----BEGIN")

    def generate_keypair(self, algorithm_type="kex"):
        """Generate a KEM or signature keypair."""
        try:
            if not HAS_OQS:
                # Insecure fallback mode for local bring-up only.
                from cryptography.hazmat.primitives.asymmetric import rsa
                from cryptography.hazmat.primitives import serialization

                private_key = rsa.generate_private_key(
                    public_exponent=65537,
                    key_size=2048,
                    backend=default_backend(),
                )
                private_pem = private_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                )
                public_pem = private_key.public_key().public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )
                algorithm_label = (
                    f"{self.sig_algorithm}_FALLBACK"
                    if algorithm_type == "sig"
                    else f"{self.kex_algorithm}_FALLBACK"
                )
                return {
                    "public_key": base64.b64encode(public_pem).decode(),
                    "secret_key": base64.b64encode(private_pem).decode(),
                    "algorithm": algorithm_label,
                }

            if algorithm_type == "kex":
                with oqs.KeyEncapsulation(self.kex_algorithm) as client:
                    public_key = client.generate_keypair()
                    secret_key = client.export_secret_key()
                return {
                    "public_key": base64.b64encode(public_key).decode(),
                    "secret_key": base64.b64encode(secret_key).decode(),
                    "algorithm": self.kex_algorithm,
                }
            if algorithm_type == "sig":
                with oqs.Signature(self.sig_algorithm) as signer:
                    public_key = signer.generate_keypair()
                    secret_key = signer.export_secret_key()
                return {
                    "public_key": base64.b64encode(public_key).decode(),
                    "secret_key": base64.b64encode(secret_key).decode(),
                    "algorithm": self.sig_algorithm,
                }
            raise ValueError(f"Unsupported algorithm_type: {algorithm_type}")
        except Exception as e:
            raise Exception(f"Keypair generation failed: {str(e)}")

    def encapsulate(self, public_key_b64, kex_algorithm: Optional[str] = None):
        """Encapsulate a shared secret using a KEM public key."""
        try:
            algorithm = kex_algorithm or self.kex_algorithm
            if not HAS_OQS or self._looks_like_pem_key(public_key_b64):
                # Insecure fallback mode for local bring-up only.
                shared_secret = secrets.token_bytes(32)
                return {
                    "ciphertext": base64.b64encode(shared_secret).decode(),
                    "shared_secret": base64.b64encode(shared_secret).decode(),
                }

            public_key = base64.b64decode(public_key_b64)
            # Newer oqs-python expects public_key passed to encap_secret(),
            # older versions allowed passing it at construction time.
            try:
                with oqs.KeyEncapsulation(algorithm) as client:
                    ciphertext, shared_secret = client.encap_secret(public_key)
            except TypeError:
                with oqs.KeyEncapsulation(algorithm, public_key) as client:
                    ciphertext, shared_secret = client.encap_secret()
            return {
                "ciphertext": base64.b64encode(ciphertext).decode(),
                "shared_secret": base64.b64encode(shared_secret).decode(),
            }
        except Exception as e:
            raise Exception(f"Encapsulation failed: {str(e)}")

    def decapsulate(self, secret_key_b64, ciphertext_b64, kex_algorithm: Optional[str] = None):
        """Decapsulate a shared secret from KEM ciphertext."""
        try:
            algorithm = kex_algorithm or self.kex_algorithm
            if not HAS_OQS or self._looks_like_pem_key(secret_key_b64):
                # Insecure fallback mode for local bring-up only.
                return base64.b64encode(base64.b64decode(ciphertext_b64)).decode()

            secret_key = base64.b64decode(secret_key_b64)
            ciphertext = base64.b64decode(ciphertext_b64)
            with oqs.KeyEncapsulation(algorithm, secret_key) as server:
                shared_secret = server.decap_secret(ciphertext)
            return base64.b64encode(shared_secret).decode()
        except Exception as e:
            raise Exception(f"Decapsulation failed: {str(e)}")
    
    def sign(self, message, secret_key_b64, sig_algorithm: Optional[str] = None):
        """Create a digital signature."""
        try:
            algorithm = sig_algorithm or self.sig_algorithm
            if not HAS_OQS or self._looks_like_pem_key(secret_key_b64):
                # Insecure fallback mode for local bring-up only.
                from cryptography.hazmat.primitives import serialization
                from cryptography.hazmat.primitives.asymmetric import padding

                message_bytes = message.encode() if isinstance(message, str) else message
                private_key = serialization.load_pem_private_key(
                    base64.b64decode(secret_key_b64),
                    password=None,
                    backend=default_backend(),
                )
                signature = private_key.sign(
                    message_bytes,
                    padding.PSS(
                        mgf=padding.MGF1(hashes.SHA256()),
                        salt_length=padding.PSS.MAX_LENGTH,
                    ),
                    hashes.SHA256(),
                )
                return base64.b64encode(signature).decode()

            secret_key = base64.b64decode(secret_key_b64)
            message_bytes = message.encode() if isinstance(message, str) else message
            with oqs.Signature(algorithm, secret_key) as signer:
                signature = signer.sign(message_bytes)
            return base64.b64encode(signature).decode()
        except Exception as e:
            raise Exception(f"Signature generation failed: {str(e)}")
    
    def verify(self, message, signature_b64, public_key_b64, sig_algorithm: Optional[str] = None):
        """Verify a digital signature."""
        try:
            algorithm = sig_algorithm or self.sig_algorithm
            if not HAS_OQS or self._looks_like_pem_key(public_key_b64):
                # Insecure fallback mode for local bring-up only.
                from cryptography.hazmat.primitives import serialization
                from cryptography.hazmat.primitives.asymmetric import padding

                signature = base64.b64decode(signature_b64)
                message_bytes = message.encode() if isinstance(message, str) else message
                public_key = serialization.load_pem_public_key(
                    base64.b64decode(public_key_b64),
                    backend=default_backend(),
                )
                try:
                    public_key.verify(
                        signature,
                        message_bytes,
                        padding.PSS(
                            mgf=padding.MGF1(hashes.SHA256()),
                            salt_length=padding.PSS.MAX_LENGTH,
                        ),
                        hashes.SHA256(),
                    )
                    return True
                except Exception:
                    # Legacy fallback compatibility (pre-RSA fallback used HMAC).
                    import hmac
                    secret = base64.b64decode(public_key_b64)[:32]
                    expected_sig = hmac.new(secret, message_bytes, "sha256").digest()
                    return hmac.compare_digest(signature, expected_sig)

            signature = base64.b64decode(signature_b64)
            public_key = base64.b64decode(public_key_b64)
            message_bytes = message.encode() if isinstance(message, str) else message
            with oqs.Signature(algorithm, public_key) as verifier:
                result = verifier.verify(message_bytes, signature)
            return True if result is None else bool(result)
        except Exception:
            return False

    def derive_aes_key(self, shared_secret_b64, salt: Optional[str] = None):
        """Derive an AES-256 key from a KEM shared secret."""
        try:
            if salt is None:
                salt = secrets.token_bytes(16)
            else:
                salt = base64.b64decode(salt) if isinstance(salt, str) else salt

            shared_secret = base64.b64decode(shared_secret_b64)

            kdf = HKDF(
                algorithm=hashes.SHA256(), length=32, salt=salt, info=b"pqc-evidence-aes-key"
            )
            key = kdf.derive(shared_secret)

            return {
                "key": base64.b64encode(key).decode(),
                "salt": base64.b64encode(salt).decode(),
            }
        except Exception as e:
            raise Exception(f"Key derivation failed: {str(e)}")

    def encrypt_evidence(self, plaintext, encryption_key_b64, iv=None):
        """Encrypt evidence using AES-256-GCM."""
        try:
            encryption_key = base64.b64decode(encryption_key_b64)

            if iv is None:
                iv = secrets.token_bytes(12)
            else:
                iv = base64.b64decode(iv) if isinstance(iv, str) else iv

            plaintext_bytes = plaintext.encode() if isinstance(plaintext, str) else plaintext

            cipher = Cipher(
                algorithms.AES(encryption_key),
                modes.GCM(iv),
                backend=default_backend(),
            )
            encryptor = cipher.encryptor()
            ciphertext = encryptor.update(plaintext_bytes) + encryptor.finalize()

            return {
                "ciphertext": base64.b64encode(ciphertext).decode(),
                "iv": base64.b64encode(iv).decode(),
                "tag": base64.b64encode(encryptor.tag).decode(),
            }
        except Exception as e:
            raise Exception(f"Encryption failed: {str(e)}")

    def decrypt_evidence(self, ciphertext_b64, encryption_key_b64, iv_b64, tag_b64):
        """Decrypt evidence using AES-256-GCM and return bytes."""
        try:
            encryption_key = base64.b64decode(encryption_key_b64)
            ciphertext = base64.b64decode(ciphertext_b64)
            iv = base64.b64decode(iv_b64)
            tag = base64.b64decode(tag_b64)

            cipher = Cipher(
                algorithms.AES(encryption_key),
                modes.GCM(iv, tag),
                backend=default_backend(),
            )
            decryptor = cipher.decryptor()
            plaintext = decryptor.update(ciphertext) + decryptor.finalize()
            return plaintext
        except Exception as e:
            raise Exception(f"Decryption failed: {str(e)}")


# Global instance
pqc_engine = PQCEngine()
