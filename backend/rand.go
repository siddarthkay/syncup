package gobridge

import "crypto/rand"

func readRand(b []byte) (int, error) {
	return rand.Read(b)
}
