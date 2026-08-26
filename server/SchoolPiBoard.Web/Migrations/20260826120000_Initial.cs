using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Учётные записи и одноразовые коды из писем — этап 11a.
///
/// Написана вручную, а не командой dotnet ef: у среды, где готовилась эта
/// правка, нет доступа к пакетам .NET. Чтобы расхождение модели и миграций
/// не всплыло в бою, сборка в CI выполняет
/// dotnet ef migrations has-pending-model-changes и падает при расхождении.
/// </summary>
// [DbContext] обязателен наравне с [Migration]: он связывает миграцию с
// контекстом. Обычно оба атрибута кладёт в файл .Designer.cs команда
// dotnet ef; здесь миграция написана вручную, и без этой строки EF не
// находит её вовсе — сообщает «база уже актуальна», заводит пустую таблицу
// истории и не создаёт ни одной таблицы.
[DbContext(typeof(AppDbContext))]
[Migration("20260826120000_Initial")]
public partial class Initial : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "users",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                email = table.Column<string>(type: "text", nullable: false),
                password_hash = table.Column<string>(type: "text", nullable: false),
                display_name = table.Column<string>(type: "text", nullable: false),
                external_id = table.Column<string>(type: "text", nullable: true),
                email_confirmed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                last_seen_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_users", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "email_tokens",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                kind = table.Column<string>(type: "text", nullable: false),
                token_hash = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                used_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_email_tokens", x => x.id);
                table.ForeignKey(
                    name: "FK_email_tokens_users_user_id",
                    column: x => x.user_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_users_email",
            table: "users",
            column: "email",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_email_tokens_token_hash",
            table: "email_tokens",
            column: "token_hash");

        migrationBuilder.CreateIndex(
            name: "IX_email_tokens_user_id",
            table: "email_tokens",
            column: "user_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "email_tokens");
        migrationBuilder.DropTable(name: "users");
    }
}
