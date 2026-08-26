using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Срок жизни ссылки на доску.
///
/// Уже существующим доскам ставим текущее время, а не начало эпохи: иначе
/// каждая ссылка протухла бы в момент применения миграции, и владельцы
/// получили бы новые токены, ничего не сделав.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260826180000_LinkRotation")]
public partial class LinkRotation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "link_issued_at",
            table: "boards",
            type: "timestamp with time zone",
            nullable: false,
            defaultValueSql: "now()");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "link_issued_at",
            table: "boards");
    }
}
