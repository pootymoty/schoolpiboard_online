using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Загруженные файлы: библиотека документов и картинки на досках.
///
/// Связей с пользователем и доской нет намеренно: файлы должны пережить
/// удаление учётной записи и уйти вместе с ней позже, по общему сроку
/// хранения, а не пропасть в тот же миг у всех участников доски.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260901120000_Files")]
public partial class Files : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "stored_files",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                owner_id = table.Column<long>(type: "bigint", nullable: false),
                kind = table.Column<string>(type: "text", nullable: false),
                board_id = table.Column<long>(type: "bigint", nullable: true),
                name = table.Column<string>(type: "text", nullable: false),
                content_type = table.Column<string>(type: "text", nullable: false),
                size = table.Column<long>(type: "bigint", nullable: false),
                storage_key = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_stored_files", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_stored_files_owner_id_kind",
            table: "stored_files",
            columns: new[] { "owner_id", "kind" });

        migrationBuilder.CreateIndex(
            name: "IX_stored_files_board_id",
            table: "stored_files",
            column: "board_id");

        migrationBuilder.CreateIndex(
            name: "IX_stored_files_storage_key",
            table: "stored_files",
            column: "storage_key",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "stored_files");
    }
}
