using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Запись занятия: сама запись и её шаги, плюс пределы на тариф.
///
/// Пределы — не отдельная миграция: без них таблица заводилась бы без
/// правила, сколько записей и какой длины ею можно сделать, а платная
/// функция без предела быть не должна ни на минуту.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260923120000_BoardRecordings")]
public partial class BoardRecordings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "max_recordings_per_board",
            table: "plans",
            type: "integer",
            nullable: false,
            defaultValue: 1);

        migrationBuilder.AddColumn<int>(
            name: "max_recording_minutes",
            table: "plans",
            type: "integer",
            nullable: false,
            defaultValue: 30);

        // Значения по тарифу, а не общий потолок: у бесплатного он самый
        // тесный, но не нулевой — запись остаётся ощутимой даже без оплаты.
        migrationBuilder.Sql(@"
            UPDATE plans SET max_recordings_per_board = 1,  max_recording_minutes = 30  WHERE code = 'free';
            UPDATE plans SET max_recordings_per_board = 5,  max_recording_minutes = 90  WHERE code = 'standard';
            UPDATE plans SET max_recordings_per_board = 15, max_recording_minutes = 180 WHERE code = 'extended';
            UPDATE plans SET max_recordings_per_board = 50, max_recording_minutes = 360 WHERE code = 'deep';
        ");

        migrationBuilder.CreateTable(
            name: "board_recordings",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                started_by_user_id = table.Column<long>(type: "bigint", nullable: false),
                title = table.Column<string>(type: "text", nullable: true),
                status = table.Column<string>(type: "text", nullable: false),
                started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ended_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                duration_ms = table.Column<long>(type: "bigint", nullable: false),
                last_resumed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                max_duration_ms = table.Column<long>(type: "bigint", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_recordings", x => x.id);
                table.ForeignKey(
                    name: "FK_board_recordings_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "board_recording_steps",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                recording_id = table.Column<long>(type: "bigint", nullable: false),
                offset_ms = table.Column<long>(type: "bigint", nullable: false),
                name = table.Column<string>(type: "text", nullable: false),
                payload = table.Column<string>(type: "jsonb", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_recording_steps", x => x.id);
                table.ForeignKey(
                    name: "FK_board_recording_steps_board_recordings_recording_id",
                    column: x => x.recording_id,
                    principalTable: "board_recordings",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_board_recordings_board_id_started_at",
            table: "board_recordings",
            columns: new[] { "board_id", "started_at" });

        migrationBuilder.CreateIndex(
            name: "IX_board_recording_steps_recording_id_id",
            table: "board_recording_steps",
            columns: new[] { "recording_id", "id" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "board_recording_steps");
        migrationBuilder.DropTable(name: "board_recordings");
        migrationBuilder.DropColumn(name: "max_recording_minutes", table: "plans");
        migrationBuilder.DropColumn(name: "max_recordings_per_board", table: "plans");
    }
}
