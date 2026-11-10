using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations
{
    /// <summary>
    /// Вопросы двух типов — оценка и открытый ответ — вместо постоянного
    /// поля комментария в конце.
    ///
    /// Уже собранные комментарии не теряются: у прошлых опросов в снимок
    /// вопросов дописывается открытый вопрос «comment», а сами комментарии
    /// переезжают в texts под этим ключом. Только потом колонка comment
    /// удаляется.
    ///
    /// И шаблоны опросов — сохранённые наборы вопросов, по уникальному имени.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261110053408_SurveyQuestionTypes")]
    public partial class SurveyQuestionTypes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "texts",
                table: "survey_responses",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.Sql("""
                UPDATE survey_responses
                SET texts = jsonb_build_object('comment', comment)
                WHERE comment IS NOT NULL AND btrim(comment) <> '';
                """);

            migrationBuilder.Sql("""
                UPDATE surveys
                SET questions = questions || '[{"key":"comment","text":"Что улучшить? Замечания, предложения, жалобы — всё, что хотите сказать","optional":true,"type":"text"}]'::jsonb
                WHERE NOT questions @> '[{"key":"comment"}]'::jsonb;
                """);

            migrationBuilder.DropColumn(
                name: "comment",
                table: "survey_responses");

            migrationBuilder.CreateTable(
                name: "survey_templates",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    questions = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_survey_templates", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_survey_templates_name",
                table: "survey_templates",
                column: "name",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "survey_templates");

            migrationBuilder.AddColumn<string>(
                name: "comment",
                table: "survey_responses",
                type: "text",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE survey_responses SET comment = texts ->> 'comment';
                """);

            migrationBuilder.DropColumn(
                name: "texts",
                table: "survey_responses");
        }
    }
}
