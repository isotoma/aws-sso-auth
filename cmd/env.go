package cmd

import (
	"fmt"
	"log"

	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(envCmd)
}

var envCmd = &cobra.Command{
	Use: "env",
	Run: func(cmd *cobra.Command, args []string) {
		cache := getCacheFile()
		creds, err := getCredentials(cache)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("export AWS_ACCESS_KEY_ID=%s\n", creds.AccessKeyId)
		fmt.Printf("export AWS_SECRET_ACCESS_KEY=%s\n", creds.SecretAccessKey)
		fmt.Printf("export AWS_SESSION_TOKEN=%s\n", creds.SessionToken)
	},
}
