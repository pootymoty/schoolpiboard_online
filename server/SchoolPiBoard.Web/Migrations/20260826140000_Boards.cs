using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Доски и участники — этап 11b.
///
/// Ссылка живёт в самой доске: она одна и роли не несёт — роль назначает
/// владелец, когда впускает. Отдельной таблицы под неё нет, потому что
/// хранить в ней было бы нечего, кроме одного токена на доску.
///
/// Гостей среди участников нет: они нигде не хранятся, у гостя нет ничего,
/// что переживёт закрытие вкладки.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260826140000_Boards")]
public partial class Boards : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "boards",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                owner_id = table.Column<long>(type: "bigint", nullable: false),
                title = table.Column<string>(type: "text", nullable: false),
                link_token = table.Column<string>(type: "text", nullable: false),
                auto_admit = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                locked = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                bytes_used = table.Column<long>(type: "bigint", nullable: false, defaultValue: 0L),
                deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_boards", x => x.id);
                table.ForeignKey(
                    name: "FK_boards_users_owner_id",
                    column: x => x.owner_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "board_members",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                role = table.Column<string>(type: "text", nullable: false),
                source = table.Column<string>(type: "text", nullable: false),
                joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                banned_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_members", x => x.id);
                table.ForeignKey(
                    name: "FK_board_members_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_board_members_users_user_id",
                    column: x => x.user_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_boards_owner_id",
            table: "boards",
            column: "owner_id");

        // Вход по ссылке — это поиск по токену, и он должен быть быстрым
        // и однозначным.
        migrationBuilder.CreateIndex(
            name: "IX_boards_link_token",
            table: "boards",
            column: "link_token",
            unique: true);

        // Один человек — одна строка на доске. Индексом, а не проверкой перед
        // вставкой: два одновременных входа по ссылке прошли бы её оба.
        migrationBuilder.CreateIndex(
            name: "IX_board_members_board_id_user_id",
            table: "board_members",
            columns: new[] { "board_id", "user_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_board_members_user_id",
            table: "board_members",
            column: "user_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "board_members");
        migrationBuilder.DropTable(name: "boards");
    }
}
