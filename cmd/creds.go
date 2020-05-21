package cmd

import (
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/sso"
)

type Creds struct {
	AccessKeyId string `json:accessKeyId`
	SecretAccessKey string `json:secretAccessKey`
	SessionToken string `json:sessionToken`
}

func getCredentials(cache CacheFile) (*Creds, error) {
	accountId, roleName := getSSODetails()
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(cache.Region),
	})
	if err != nil {
		return nil, err
	}
	svc := sso.New(sess)
	output, err := svc.GetRoleCredentials(&sso.GetRoleCredentialsInput{
		AccessToken: aws.String(cache.AccessToken),
		AccountId: aws.String(accountId),
		RoleName: aws.String(roleName),
	})
	if err != nil {
		return nil, err
	}
	return &Creds{
		AccessKeyId: *output.RoleCredentials.AccessKeyId,
		SecretAccessKey: *output.RoleCredentials.SecretAccessKey,
		SessionToken: *output.RoleCredentials.SessionToken,
	}, nil
}