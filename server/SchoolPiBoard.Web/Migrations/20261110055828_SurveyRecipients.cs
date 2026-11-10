using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations
{
    /// <summary>
    /// Адресаты опроса: кому он отправлен. Отвечать может только тот, кому
    /// письмо со ссылкой действительно ушло (sent_at), — пересланная ссылка
    /// постороннему не поможет, даже если он заведёт учётную запись.
    ///
    /// У опросов, отправленных до этой правки, список восстанавливается так,
    /// как его тогда считала рассылка: подтверждённая почта, запись заведена
    /// до опроса и не была удалена к тому моменту. И все, кто уже ответил.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261110055828_SurveyRecipients")]
    public partial class SurveyRecipients : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "survey_recipients",
                columns: table => new
                {
                    survey_id = table.Column<long>(type: "bigint", nullable: false),
                    user_id = table.Column<long>(type: "bigint", nullable: false),
                    sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_survey_recipients", x => new { x.survey_id, x.user_id });
                    table.ForeignKey(
                        name: "FK_survey_recipients_surveys_survey_id",
                        column: x => x.survey_id,
                        principalTable: "surveys",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_survey_recipients_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_survey_recipients_user_id",
                table: "survey_recipients",
                column: "user_id");

            migrationBuilder.Sql("""
                INSERT INTO survey_recipients (survey_id, user_id, sent_at)
                SELECT s.id, u.id, s.created_at
                FROM surveys s
                JOIN users u ON u.email_confirmed
                    AND u.created_at <= s.created_at
                    AND (u.deleted_at IS NULL OR u.deleted_at > s.created_at)
                ON CONFLICT DO NOTHING;
                """);

            migrationBuilder.Sql("""
                INSERT INTO survey_recipients (survey_id, user_id, sent_at)
                SELECT p.survey_id, p.user_id, s.created_at
                FROM survey_participants p
                JOIN surveys s ON s.id = p.survey_id
                ON CONFLICT DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "survey_recipients");
        }
    }
}
